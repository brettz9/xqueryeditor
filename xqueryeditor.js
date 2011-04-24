/*globals $, CodeMirror, MediawikiAPI, XQueryHelper, XMLSerializer, DOMParser */
/*
("Unlicense")
This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
*/

/*
// Fix:

0) Support external files (e.g., SVG); apparently needs Mediawiki source alteration

0) Did parse not work in some situations--need expandtemplates? Fix pre-parsing of wikis (and handling expandtemplates in older wikis)
0) Could add appropriate default titles (and adjust root categories too, e.g., to the XML Formats root); reorganize those wikis to ensure 
they have categories like  XML Format->SVG Format, etc. (not just XML, SVG)); and good sample pages; with ability now to click on links 
to current (root?) category's parents, a lower choice than root still allows access to root; should be able to use Special:MIMESearch but doesn't seem
to work well on at least Wikimedia wikis

1) Add HTML santization (for my XQuery hack internally (find usage internally of b:dom()?) as well as for previews); try subsetting RelaxNG of HTML and
using techniques of HTMLPurifier.org to e.g., eliminate "javascript:" from beginning of 'href' attributes, dangerous CSS (need CSS Parser), etc.
2) Add IndexedDB storage, with periodic checks to get latest data if online and with if-not-modified-since headers
3) Add support for collections associated with categories or user-defined; allow queries across collections, putting docs into a dummy container
4) Add support for distributed wikis--Pubsub for repositories and other XMPP for pull requests; private note-taking, while sending out in 
real time non-private changes made locally from own "server" to real server; one is always free to change the host, as storing copies all locally
5) Add support for jQuery-style searching as a (more familiar but less powerful) alternative to XQuery
6) Allow full-text searches for tabular display (and mode for showing nothing but preview and results)
7) Create "standard" Shared Worker library for allowing permissions to database, so other apps can request this data (e.g., if Mediawiki makes 
this API available, others can communicate with it to utilize the user's texts without needing to redownload; an HTML5 "shared database" 
which managed privileges by requesting different levels of access from the user (e.g., "This site would like read-only permission to your data table
'My personal notes' created by the application at 'http://calendar.example.com'; do you accept?" would be, imo, much easier for everyone wishing
to open their data, if this is ever accepted into the spec, but a second best option is to make a Shared Worker which does this automatically;
does the SharedWorker mean the other app must be in a tab, in an iframe? How to trigger requests for permission in a standard way?)
*/

// APPLICATION CACHE
// For debugging, ensure it checks in a timely manner; having problems with Apache settings, 
// so we want to ensure the manifest file itself is not cached during debugging
// Fix: comment this out for production

// applicationCache.update();


$(applicationCache).bind('updateready',
    // Ensure the new manifest is hot-swapped to be used immediately if it is updated and successfully downloaded
    function (event) {
        applicationCache.swapCache();
    }
);

$(window).load(function() {
    // DEBUGGING ONLY
    function ser (el) {
        var str = new XMLSerializer().serializeToString(el);
        alert(str);
        return str;
    }
    function whatIs (obj) {
        var str = '';
        for (var p in obj) {
            str += p + '::' + obj[p] + '\n';
        }
        alert(str);
    }

    // DECLARATIONS/INITIALIZATIONS
    var xqueryEditor, xmlEditor, resultsBox,
        alternate = false,
        // xh = XQueryHelper(),
        finished = true,
        height = '300px',
        xhtmlns = 'http://www.w3.org/1999/xhtml';

    function _getEditorSetter (type, useTitle) {
        var urlID = '#wiki-api-url-' + type,
            titleID = '#wiki-api-title-' + type,
            parsedID = '#wiki-api-parsed-' + type;
        return function(dynamicTitle) {
            var editor = type === 'xml' ? xmlEditor : xqueryEditor, // Not available yet
                title = useTitle ? $(titleID).val() : dynamicTitle,
                url = $(urlID).val(),
                method = ($(parsedID).is(':checked')) ? 'getParsedPage' : 'getUnparsedPage';
            MediawikiAPI(url)[method](
                title || dynamicTitle, 
                function (currentRevision) {
                    editor.setCode(currentRevision);
                },
                function (e, data, url, info, code, error) {
                    alert(url);
                    alert(info);
                    whatIs(data);
                }
            );
        };
    }

    
    function _getCategoryUpdateTree (type) {
        var categoryTree = '#' + type + '-category-tree',
            urlID = '#wiki-api-url-' + type,
            rootID = '#wiki-api-root-category-' + type,
            categoryLinksID = '#' + type + '-root-category-links',
            editor = (type === 'xml') ? xmlEditor : xqueryEditor,
            editorSetter = _getEditorSetter(type),
            fileCb = function (content) {
                editor.setCode(content);
            },
            subpagesErrorCb = function (e, data, url, info, code, error) {
                alert(data);
            },
            categoryErrorCb = function (e, data, url, info, code, error) {
                alert(e);
            },
            fileErrorCb = function (e, data, url, info, code, error) {
                alert(e);
            };
        
        return function () {
            var url = $(urlID).val(),
                rootTitle = $(rootID).val(),
                mwa = MediawikiAPI(url);
            
            mwa.buildCategoryTree(rootTitle, categoryTree, editorSetter, fileCb, categoryErrorCb, subpagesErrorCb, fileErrorCb);
            $(categoryLinksID).empty().append('Parent categories: ');
            mwa.getPageCategories(
                rootTitle, 
                function (category, ns, catObj) {
                    var a = $('<a class="parent-category" href="javascript:void(0);">'+category.replace(/^Category:/, '')+'</a>').click(function () {
                        $(rootID).val(category);
                        _getCategoryUpdateTree(type)();
                    });
                    $(categoryLinksID).append(a, ' ');
                },
                function (i) {
                },
                function (e, data, url, info, code, error) {
                    $(categoryLinksID).empty();
                    // Fail silently as root might not have categories
                }
            );
        };
    }

    // Add click events on buttons to get the source XML or XQuery documents
    $('#getXQueryDocument').click(_getEditorSetter('xquery', true));
    $('#getXMLDocument').click(_getEditorSetter('xml', true));    

    
    // PROVIDE INITIAL CATEGORY TREE
    _getCategoryUpdateTree('xml')();
    _getCategoryUpdateTree('xquery')();

    
    // SET UP CODE HIGHLIGHTERS
    // 
    // We at least add styling for unvisited links and fix base URL inline
    var style = '<style type="text/css" media="all">a.new,#quickbar a.new{color:#ba0000}</style>';
    function _wrapCode (code) {
        /*
        // Converts our own links
        var base = document.createElementNS(xhtmlns, 'base');
        base.href = (url.match(/^https?:\/\//) ? url : 'http://' + url) +'/';
        document.documentElement.firstChild.appendChild(base);
        */
        // We can replace the links inline instead:
        
        var url = $('#wiki-api-url-xml').val()        
        return style + code.replace(/<a href="\//g, '<a href="'+ (url.match(/^https?:\/\//) ? url : 'http://' + url) +'/');                        
    }
    
    xqueryEditor = CodeMirror.fromTextArea('xquery', 
        {
            height: height,
            parserfile: ["../contrib/xquery/js/tokenizexquery.js", "../contrib/xquery/js/parsexquery.js" ],
            stylesheet: ["CodeMirror/contrib/xquery/css/xqcolors.css"],
            path: "CodeMirror/js/",
            continuousScanning: false, //500,
            lineNumbers: true
        }
    );
    xmlEditor = CodeMirror.fromTextArea('xml',
        {
            height: height,
            parserfile: ["../js/parsexml.js"],
            stylesheet: ["CodeMirror/css/xmlcolors.css"],
            path: "CodeMirror/js/",
            continuousScanning: false,
            lineNumbers: true,
            onChange : function () {
                if ($("#previewSource-on").is(':checked')) {
                    $('#previewSource').html(_wrapCode(xmlEditor.getCode()));
                }
            }
        }
    );
    resultsBox = CodeMirror.fromTextArea('results',
        {
            height: height,
            parserfile: ["../js/parsexml.js"],
            stylesheet: ["CodeMirror/css/xmlcolors.css"],
            path: "CodeMirror/js/",
            continuousScanning: false,
            lineNumbers: true,
            onChange : function () {
                if ($("#previewResults-on").is(':checked')) {
                    $('#previewResults').html()(_wrapCode(resultsBox.getCode()));
                }
            }
        }
    );
    
    // Enable CodeMirror Syntax Highlighter Stylesheet switching
    $('.css-switch').click(function() {
         xqueryEditor.setStylesheet('CodeMirror/contrib/xquery/css/' + $(this).attr('rel'));
    });

    // UI EVENTS
    
    // Add click events on the button to update the category tree
    $('#updateCategoryTree-xquery').click(_getCategoryUpdateTree('xquery'));
    $('#updateCategoryTree-xml').click(_getCategoryUpdateTree('xml'));


    
    // Handle toggle of collapsible page selection boxes    
    $('#results-place-holder-inner').hide();
    $('.collapsible').add('.obtain-page').click(function (e)  {
        var elname = e.target.nodeName.toLowerCase();
        if (['h2', 'fieldset', 'legend', 'div'].indexOf(elname) < 0) {return;}
        alternate = !alternate;
        var method = alternate ? 'show' : 'hide';
        $('#results-place-holder-inner')[method]();
        $('.obtain-page').add('#results-place-holder').slideToggle();
    });

    // Enable drop-down of wiki API sites to alter wiki API textbox
    $('.wiki-api-sites').change(function (e) {
        var type = $(this).attr('data-type'),
            values = $(this).val().split(/\s+/),
            url = values[0],
            category = values[1],
            title = values[2]; // Not in use yet
        $('#wiki-api-url-' + type).val(url || '');
        $('#wiki-api-root-category-' + type).val(category || '');
        $('#wiki-api-title-' + type).val(title || '');
        _getCategoryUpdateTree(type)();
    });

    /*
    // Updating when input box changes is not adequate, since user 
    //    may want a different root (though can rely on drop-down)
    $('.wiki-api-url').change(function (e) {
        _getCategoryUpdateTree(e.target.getAttribute('data-type'))();
    });
    */

    // Force an onChange event for the XML and Results editors, so they can update their respective preview windows
    $('.preview-checkbox').click(function (e) {
        var editor = (e.target.id === 'previewSource-on') ? xmlEditor : resultsBox;
        // Cause a change
        editor.setCode(editor.getCode() + ' ');
        editor.setCode(editor.getCode().slice(0, -1));
    });
    
    // Event to execute XQuery based on button click
    $('#evaluate').click(function() {
        if (!finished) { // Don't process clicks until result returned and temporary element removed
            return;
        }
        finished = false;
        var xml = xmlEditor.getCode().replace(/<\?xml.*\?>[\s]*/, '');
        xml = new DOMParser().parseFromString('<div xmlns="'+xhtmlns+'">'+xml+'</div>', 'text/xml').documentElement.cloneNode(true);
        if (xml.firstChild.nodeName === 'parsererror' && 
            (
            xml.firstChild.namespaceURI === 'http://www.mozilla.org/newlayout/xml/parsererror.xml' || // Firefox
            xml.firstChild.namespaceURI === xhtmlns // Google
            )
        ) {
            alert('Your XML input is not well-formed');
            // Why in Chrome does this seem to disable the button??
            return;
        }
        
        var bogusEl = document.createElementNS(xhtmlns, 'div');
        bogusEl.id = 'XQuery-Bogus-TempContainer';
        bogusEl.style.display = 'none';
        while (xml.firstChild) {
            bogusEl.appendChild(xml.firstChild);
        }
        // bogusEl.innerHTML = xmlEditor.getCode(); // We can't do this because innerHTML treats mishandles tags for our purposes due to distinctions between XML and HTML parsing        
        document.body.appendChild(bogusEl);
      
        var xquery = xqueryEditor.getCode();
        xquery = xquery.replace(/doc\(\)/, 'b:dom()/html[1]/body[1]/div[@id="XQuery-Bogus-TempContainer"]'); // Fix: should plug into an API rather than hacking it here

        XQueryHelper.getXQueryResult(xquery, function (result) {
            resultsBox.setCode(result);
            document.body.removeChild(bogusEl);
            finished = true;
        });
    });    
});
