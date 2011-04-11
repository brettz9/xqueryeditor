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

(function () {

    var JSONP = (function(global) { // Introduces only one global                
        // MIT Style license, adapted from http://devpro.it/code/209.html
        var id = 0, documentElement = document.documentElement;
        return function JSONP(uri, callback, backwardsCompatibleMode) {
            // We can eliminate globals by crafting the JSONP object properly, but old Mediawikis don't allow '.' inside the calls; default to true
            backwardsCompatibleMode = typeof backwardsCompatibleMode === 'undefined' ? true : backwardsCompatibleMode;
            if (backwardsCompatibleMode) {
                this[global+'_JSONP'] = JSONP;
            }
            else {
                this[global].JSONP = JSONP;
            }
            var that = this, src, script;
            function JSONPResponse() {
                // Reduce memory by deleting callbacks when finished
                if (backwardsCompatibleMode) {
                    try { delete that[global + '_JSONP' + src]; } catch(e) { that[global + '_JSONP' + src] = null; }
                }
                else {
                    try { delete that[global].JSONP[src]; } catch(e) { that[global].JSONP[src] = null; }
                }
                documentElement.removeChild(script);
                // Execute the user's callback with the arguments supplied by the server's JSONP call
                if (typeof callback === 'string') { // Assumes only one return argument and that it is an HTML string
                    document.getElementById(callback).innerHTML = arguments[0];
                }
                else {
                    callback.apply(that, arguments);
                }
            }
            // Ensure a unique callback
            src = '_' + id++;
            script = document.createElement("script");
            
            var cb;
            if (backwardsCompatibleMode) { // Adds Globals, albeit safe ones
                var func = global + '_JSONP' + src;
                this[func] = JSONPResponse;
                cb = func;
            }
            else {
                // Add our callback as a property of this JSONP
                // function to avoid introducing more globals
                this[global].JSONP[src] = JSONPResponse;
                cb = global + ".JSONP." + src;
            }
            
            // We include "callback" as it is typically used in 
            // JSONP (e.g., on Wikibooks' API) to specify the callback
            documentElement.insertBefore(
                script,
                documentElement.lastChild
            ).src = uri + "&callback=" + cb;
        };
    }('MediawikiAPI'));


    function _buildString (obj) {
        var str = '?';
        for (var param in obj) {
            str += param + '=' + obj[param] + '&';
        }
        return str.slice(0, -1);
    }
    function _getNode (node) {
        if (typeof node === 'string') {
            if (node.charAt(0) === '#') {
                return document.getElementById(node.slice(1));
            }
            return document.querySelector(node); // Implementing browsers only
        }
        return node;
    }
    function _el (el) {
        return document.createElement(el);
    }
    function _text (txt) {
        return document.createTextNode(txt);
    }
    function _addEvent (node, type, cb) {
        if (node.addEventListener) {
            return node.addEventListener(type, cb, false);
        }
        else if (node.attachEvent) {
            return node.attachEvent('on' + type, cb);
        }
        node['on'+type] = cb;
    }

    function _getListItemBuilder (type, ul, ev) {
        return function (subcatTitle) {
            var li = _el('li');
            var a = _el('a');
            a.className = type;
            a.href = 'javascript:void(0);';
            a.appendChild(_text(subcatTitle.replace(/^Category:/, '')));
            if (ev) {
                _addEvent(a, 'click', function () {
                    ev(subcatTitle, li, a);
                });
            }
            li.appendChild(a);
            ul.appendChild(li);
        };
    }
    
    function _empty (elem, type) {
        var current = elem.firstChild;
        while (current) {
            if (type === current.nodeName.toLowerCase()) {
                elem.removeChild(current);
            }
            current = current.nextSibling;
        }
    }
    
    function _errorHandler (errorCb, data, e, url) {
        if (errorCb) {
            if (typeof data === 'object' && typeof data.error === 'object') {
                errorCb(e, data, url, data.error.info, data.error.code, data.error);
            }
            else {
                errorCb(e, data, url);
            }
        }
        else {
            throw e;
        }
    }
    
    var _pageNS = '0', _categoryNS = '14';

    function MediawikiAPI (baseURL) {
        if (!(this instanceof MediawikiAPI)) {
            return new MediawikiAPI(baseURL);
        }
        if (!(/^https?:\/\//).test(baseURL)) {
            baseURL = 'http://' + baseURL;
        }
        if (baseURL.indexOf('api.php') < 0) {
            baseURL += ((baseURL.charAt(baseURL.length-1) === '/') ? '' : '/') + 'w/api.php';
        }
        this.baseURL = baseURL;
    }
    MediawikiAPI.prototype.buildCategoryTree = function(rootTitle, node, subpagesCb, categoryErrorCb, subpagesErrorCb) {
        var ul = _el('ul'), that = this;
        this.getSubcategories(rootTitle, 
            _getListItemBuilder('category', ul, function (subcatTitle, li, a) {
                that.buildCategoryTree(subcatTitle, li, subpagesCb, categoryErrorCb, subpagesErrorCb);
            }),
            function finished (i, subcats) {
                that.getSubpages(
                    rootTitle, 
                    _getListItemBuilder('subpage', ul, function (subpageTitle, li, a) {
                        subpagesCb(subpageTitle, li, a);
                    }),
                    function finished (i, subpages) {},
                    subpagesErrorCb
                );
            },
            categoryErrorCb
        );
        node = _getNode(node);
        _empty(node, 'ul');
        node.appendChild(ul);
    };
    
    /*
    
    mime =  [+\/]xml$
url = ......file to get........

    http://commons.wikimedia.org/w/api.php?action=query&titles=File:Barcode2.svg&prop=imageinfo&iiprop=timestamp|user|url|comment|size|sha1|mime|metadata|archivename|bitdepth|image

data.query.pages{for}.pageid/ns/title/imagerepository/imageinfo[timestamp/user/size/width/height/comment/url/descriptionurl/sha1/metadata[name/value (width,height,version)]/mime/bitdepth]
data.warnings.imageinfo['*']
    */
    
    MediawikiAPI.prototype.getCategoryMembers = function(rootTitle, ns, cb, finished, errorCb) {
        // Per http://www.mail-archive.com/mediawiki-api@lists.wikimedia.org/msg00336.html :
        //  cmtitle and cmcategory is required for backward compatibility; cmtitle is more rigorous in requiring 'Category:' prefix
        var url = this.baseURL + _buildString(
            {action:'query', format:'json', list:'categorymembers', cmnamespace: ns, 
                cmtitle:rootTitle, cmcategory:rootTitle.replace(/^Category:/, '')}
        );
        JSONP(url, function (data) {
            try {
                var cms = data.query.categorymembers;
                for (var i=0, sl = cms.length; i < sl; i++) {
                    cb(cms[i].title, cms[i].pageid, cms[i].ns);
                }
            }
            catch (e) {
                _errorHandler(errorCb, data, e, url);
            }
            finished(i, cms);
        });
    };    
    MediawikiAPI.prototype.getSubpages = function(rootTitle, cb, finished, errorCb) {
        return this.getCategoryMembers(rootTitle, _pageNS, cb, finished, errorCb);
    };
    MediawikiAPI.prototype.getSubcategories = function(rootTitle, cb, finished, errorCb) {
        return this.getCategoryMembers(rootTitle, _categoryNS, cb, finished, errorCb);
    };
    
    MediawikiAPI.prototype.getParsedPage = function(title, cb, errorCb) {
        var url = this.baseURL + _buildString({action:'expandtemplates', format:'json', text: '{{'+title+'}}'});
        JSONP(url, function (data) {
            try {
                cb(data.expandtemplates['*'], data);
            }
            catch(e) {
                _errorHandler(errorCb, data, e, url);
            }
        });
    };
    
    MediawikiAPI.prototype.getPageCategories = function(title, cb, finishedCb, errorCb) {
        var url = this.baseURL + _buildString({
            action:'query', prop:'categories',
            format:'json', 
            titles: encodeURIComponent(title)
        });
        JSONP(url, function (data) {
            try {
                var i, col, page, categoryObjects;
                for (page in data.query.pages) {
                    categoryObjects = data.query.pages[page].categories;
                    for (i=0, col = categoryObjects.length; i < col; i++) {
                        cb(categoryObjects[i].title, categoryObjects[i].ns, categoryObjects[i]);
                    }
                    break;
                }
                finishedCb(i, data);
            } catch(e) {
                _errorHandler(errorCb, data, e, url);
            }
        });
    };
    
    
    MediawikiAPI.prototype.getUnparsedPage = function(title, cb, errorCb) {
        var url = this.baseURL + _buildString({
            action:'query', prop:'revisions', rvprop:'content',
            rvlimit:1, format:'json', 
            titles: encodeURIComponent(title)
        });
        JSONP(url, function (data) {
            try {
                for (var page in data.query.pages) {
                    var currentRevision = data.query.pages[page].revisions[0]['*'];
                    cb(currentRevision);
                    break;
                }
            } catch(e) {
                _errorHandler(errorCb, data, e, url);
            }
        });
    };
    
    // EXPORTS
    this.MediawikiAPI = MediawikiAPI;
}());

