/*globals mxqueryjs*/
// This code is from https://gist.github.com/900225
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

// Demo HTML available at https://gist.github.com/900398

// Helper kludge class for http://www.xqib.org/?p=49 to allow XQueries to be run dynamically 
// from JavaScript (whether for immediate insertion into the page or for handling as 
// strings per the wishes by the user) and to allow pure XQueries within script tags, 
// rather than with the enriched but proprietary extensions

// IMPORTANT NOTE: Even the XQueryHelper::getXQueryResult() method temporarily inserts 
// queries into the DOM, which can be harmful for a website if the user input is unsecure. 

// Tested in Chrome 11.0.696.28 beta, Firefox 3.6.16, 
// Opera 9.64.10487.0 and 11.1.1190.0, Safari 5.0.4 (7533.20.27)

// Future hopes
// 1) Working with IndexedDB (allowing collections to target groups of files within a single query)
// 2) Working with jsDOM for use on SSJS + e.g., SQL or NoSQL dbs? (allowing collections on 
//      different dbs to be able to target groups of files within a single query)
// 3) Allowing add-on to give privileges in Firefox (or Chrome?) to allow CommonJS-style (on the client) 
// require() sharing of IndexedDBs (and cross-domain requests), with exceptions thrown if user refuses 
// such privileged permission, along with local file access or cross-domain remote access (allowing 
// collections to be able to target groups of local or remote files within a single query), thereby 
// allowing cross-domain access to local data/databases, and cross-domain access to remote 
// data/databases; then make a collection() wrapper (and doc()?) for operating on such data by URL 
// and/or document name

// Alternative Approaches:
// The following commented out code was not adequate for XQIB on Firefox, 
// (it failed silently) though it works in Chrome (and I wanted to have
// a wrapper utility to execute XQueries independent of XQIB syntax, 
// do XQuery insertions easily, etc. anyways), so I wrote the
// XQueryHelper class below.
    /*
        try {
            var s = document.createElement('script');
            s.type = 'application/xquery';
            s.appendChild(document.createTextNode('b:alert(b:dom()//body)'));
            document.body.appendChild(s);
        }
        catch(e) {
            alert(e);
        }
        */

(function () {

var ct = 0, 
    xhtmlns = 'http://www.w3.org/1999/xhtml';

function XQueryHelper () {
    if (!(this instanceof XQueryHelper)) {
        return new XQueryHelper();
    }
}
XQueryHelper.prototype.insertXQuery = function (nodeToInsert, insertPlace, cb) {
    return XQueryHelper.attachXQueryInsertEvent(nodeToInsert, insertPlace, null, null, null, cb);
};
XQueryHelper.prototype.attachXQueryInsertEvent = function (nodeToInsert, insertPlace, decls, evType, eventTargetPath, cb) {
    var customEvent = !evType,
        decls = decls || '',
        action = action || 'insert',
        xQueryEvent = evType || 'BogusXQueryInsertEvent' + (ct++), // Custom events don't seem to work in Chrome by creating a bogus element, but we don't need one anyways
        listener = 'listener';
    insertPlace = insertPlace || eventTargetPath || '/html[1]/body[1]';
    if (!eventTargetPath) {
        eventTargetPath = '/html[1]/body[1]'; // /div[@id="bogus-xquery-element"]';
    }

    var query = decls + '\n\
declare default element namespace "http://www.w3.org/1999/xhtml";\n\
declare updating function local:' + listener + '($loc, $evtObj) {\n\
insert node ' + nodeToInsert + '\
as last into b:dom()' + insertPlace + '\n};\n\
b:addEventListener(b:dom()'+eventTargetPath+', "' + xQueryEvent + '", xs:QName("local:' + listener + '"))';

    // Fix: remove the event after firing! For now, will just increment
    XQueryHelper.executeQueryWithCustomFiring(query, xQueryEvent, customEvent, cb);
}

XQueryHelper.prototype.attachXQueryDeleteEvent = function (nodeToDelete, evType, eventTargetPath, cb) {
    var customEvent = !evType,
        action = action || 'insert',
        xQueryEvent = evType || 'BogusXQueryDeleteEvent', // Custom events don't seem to work in Chrome by creating a bogus element, but we don't need one anyways
        listener = 'listener';
    if (!eventTargetPath) {
        eventTargetPath = '/html[1]/body[1]'; // /div[@id="bogus-xquery-element"]';
    }

    var query = '\
declare default element namespace "http://www.w3.org/1999/xhtml";\n\
declare updating function local:' + listener + '($loc, $evtObj) {\n\
delete node b:dom()' + nodeToDelete + '\
\n};\n\
b:addEventListener(b:dom()'+eventTargetPath+', "' + xQueryEvent + '", xs:QName("local:' + listener + '"))';
    XQueryHelper.executeQueryWithCustomFiring(query, xQueryEvent, customEvent, cb);
}

XQueryHelper.prototype.runXQIB = function (str, cb) {
    if (mxqueryjs) { // Global of XQIB
        setTimeout(function () {XQueryHelper.runXQIB(str, cb);}, 30);
        return;
    }
    
    // The following could be used instead of the following line, if we are placed inside the mxqueryjs() function
    //n.getElementById(R).contentWindow;
    var cw = document.getElementById('mxqueryjs').contentWindow;
    
    // XQIB means of accessing auto-inserted iframe's method for processing an XQIB XQuery string
    var funcs = ['tj', 'uj', 'pj', 'qj'];
    for (var i=0, fl = funcs.length; i < fl; i++) {
        var func = cw[funcs[i]];
        if (func && func.length === 1) {
            func(str);
            break;
        }
    }
    
    if (cb) {
        cb();
    }
}

XQueryHelper.prototype.executeQueryWithCustomFiring = function (query, xQueryEvent, customEvent, cb) {
    XQueryHelper.runXQIB(query, function () {
        if (customEvent) {
            //var fireOnThis = document.getElementById('bogus-xquery-element');
            var fireOnThis = document.body; // Don't pollute the DOM by adding custom elements
            var evObj = document.createEvent('Events');
            evObj.initEvent(xQueryEvent, true, true);
            try {
                fireOnThis.dispatchEvent(evObj);
            }catch(e) {alert(e);}
        }
        if (cb) {
            cb();
        }
    });
};

XQueryHelper.prototype.getXQueryResult = function (query, cb) {
    var decls = '';
    query = query.replace(/^\s*(declare.*;)/gm, function (n0, n1) {
        decls += n1 + '\n';
        return '';
    });
    var nodeToInsert = '<div id="XQueryBogus-DeleteMe" style="display:none;">{' + query+ '}</div>',
        nodeToDelete = '//div[@id="XQueryBogus-DeleteMe"]';
    XQueryHelper.attachXQueryInsertEvent(nodeToInsert, null, decls, null, null, function () {
        var bogusElem = document.getElementById('XQueryBogus-DeleteMe');
        XQueryHelper.attachXQueryDeleteEvent(nodeToDelete, null, null, function () {
            cb(bogusElem.innerHTML);
        });
    });
};

function convertNS (node) {
    var el = document.createElementNS(xhtmlns, node.localName);
    for (var i=0, nal = node.attributes.length; i < nal; i++) {
        el.setAttributeNode(document.importNode(node.attributes[i].cloneNode(true), true));
    }
    var fromChild = node.firstChild;
    while (fromChild != null) {
        if (fromChild.nodeType === 1) {
            el.appendChild(convertNS(document.importNode(fromChild.cloneNode(true), true)));
        }
        else {
            el.appendChild(document.importNode(fromChild.cloneNode(true), true));
        }
        fromChild = fromChild.nextSibling;
    }
    return el;    
}

// Fix: allow to somehow split the prologue to include that without errors?
XQueryHelper.prototype.parseScriptTags = function () {
    var ss = document.getElementsByTagName('script');
    for (var i=0; i < ss.length; i++) {
        var s = ss[i];
        if (s.getAttribute('type') === 'text/plain' && s.getAttribute('language').toLowerCase() === 'xquery') {
            XQueryHelper.getXQueryResult(
                '<div>{' + s.innerHTML + '}</div>',
                (function (s) {
                    return function (text) {
                        var parsed = new DOMParser().parseFromString(text, 'application/xml').documentElement.cloneNode(true);
                        var sib = parsed.firstChild.nextSibling,
                            lastSib = convertNS(parsed.firstChild);
                        s.parentNode.replaceChild(lastSib, s);
                        while (sib) {
                            converted = convertNS(sib.cloneNode(true));
                            lastSib.parentNode.insertBefore(converted, lastSib.nextSibling);
                            lastSib = converted;
                            sib = sib.nextSibling;
                        }
                    };
                }(s))
            );
        }
    }
};

// Add class methods
['insertXQuery', 'attachXQueryInsertEvent', 'attachXQueryDeleteEvent', 'runXQIB', 
'executeQueryWithCustomFiring', 'getXQueryResult', 'parseScriptTags'].forEach(function (method) {
    XQueryHelper[method] = function () {
        XQueryHelper.prototype[method].apply(null, arguments);
    };
});

// EXPORTS
this.XQueryHelper = XQueryHelper;

// The code to parse such script tags makes sense to run automatically here
if (window.addEventListener) {
    window.addEventListener('load', function () {
        XQueryHelper.parseScriptTags(); // Process script type=text/plan,language=xquery tags    
    }, false); 
}
else if (window.attachEvent) { // Do we still even need this if using IE that may support this?
    window.attachEvent('onload', function () {
        XQueryHelper.parseScriptTags(); // Process script type=text/plan,language=xquery tags    
    });
}

}());
