/* Parser for RelaxNG */

var RelaxNGParser = Editor.Parser = (function() {
    var config = {}, grammarContentState, patternState, followAnnotationElementElements, noMoreFollowAnnotations,
            divBegin = [], includeBegin = [];
    var charBase = '(?:[\u0009\u000D', charEnd = '\uE000-\uFFFD]|[\ud800-\udbff][\udc00-\udfff])'; // last two ranges are surrogates for &#x10000;-&#x10FFFF; (includes private range)
    var  _NameStartCharNoColon = '(?:[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u0200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\ud800-\udb7f][\udc00-\udfff])', // The last two ranges are for surrogates that comprise #x10000-#xEFFFF (does not include private range)
            _CharNoDQ = charBase + '\u000A\u0020\u0021\u0023-\uD7FF' + charEnd,
            _CharNoSQ = charBase + '\u000A\u0020-\u0026\u0028-\uD7FF' + charEnd,
            _CharNoDQOrNewline = charBase + '\u0020\u0021\u0023-\uD7FF' + charEnd,
            _CharNoSQOrNewline = charBase + '\u0020-\u0026\u0028-\uD7FF' + charEnd,
            _Char = charBase + '\u000A\u0020-\uD7FF' + charEnd,
        _NameChar = '[.0-9\u00B7\u0300-\u036F\u203F-\u2040-]', // Don't need escaping since to be put in a character class
        _NCName = _NameStartCharNoColon + _NameChar + '*',
        _relaxNGKeyword = '(?:attribute|default|datatypes|div|element|empty|external|grammar|include|inherit|list|mixed|namespace|notAllowed|parent|start|string|text|token)',
        _literalSegment = '(?:"' + _CharNoDQOrNewline + '*"|' + 
                                            "'" + _CharNoSQOrNewline + "*'|" + 
                                            '"""(?:"{0,2}' + _CharNoDQ + ')*"""|' +
                                        "'''(?:'{0,2}" + _CharNoSQ + ")*''')",
        _literal = _literalSegment + '(?:~' + _literalSegment + ')+',
        _anyURILiteral = _literal,
        _namespaceURILiteral = '(?:inherit|'+ _literal + ')',
        _identifier = '(?:\\\\(' + _NCName + ')|(' + _NCName + '))',
        // Fix: Could parenthesize the following in order to distinctly colorize specific keywords and/or distinguish keywords from identifiers
        _identifierOrKeyword = '(?:(' + _relaxNGKeyword + ')|' + _identifier.slice(3), // we know the latter is an identifier, since we've excluded keywords
        _CName = _NCName + ':' + _NCName,
        _name = '(?:' + _identifierOrKeyword + '|' + _CName + ')',
        _annotationAttribute = '(?:' + _name + '=' + _literal + ')',
        // Fix: "There is no notion of operator precedence. It is an error for patterns to combine the |, &, , and - operators 
        // without using parentheses to make the grouping explicit. For example, foo | bar, baz is not allowed; 
        // instead, either (foo | bar), baz or foo | (bar, baz) must be used. A similar restriction applies to name 
        // classes and the use of the | and - operators. These restrictions are not expressed in the above EBNF 
        // but they are made explicit in the BNF in Section 1." ("RELAX NG Compact Syntax" specification)
        _assignMethod = '(?:[&|]?=)';
        // Fix: "A Unicode character with hex code N can be represented by the escape sequence \x{N}."

    // Private static utilities
    function _copyObj (obj, deep) {
        var ret = {};
        for (var p in obj) {
            if (obj.hasOwnProperty(p)) {
                if (deep && typeof obj[p] === 'object' && obj[p] !== null) {
                    ret[p] = _copyObj(obj[p], deep);
                }
                else {
                    ret[p] = obj[p];
                }
            }
        }
        return ret;
    }
    function _forEach (arr, h) {
        for (var i = 0, arrl = arr.length; i < arrl; i++) {
            h(arr[i], i);
        }
    }
    function _setOptions (arr, value) {
        arr = typeof arr === 'string' ? [arr] : arr;
        _forEach(arr, function (item) {
            config[item] = value;
        });
    }
    
    var tokenizeRelaxNG = (function() {
        // Private utilities
        function _lookAheadMatches (source, regex) {
            var matches = source.lookAheadRegex(regex, true);
            if (matches && matches.length > 1) { // Allow us to return the position of a match out of alternates
                for (var i = matches.length - 1; i >= 0; i--) {
                    if (matches[i] != null) {
                        return i;
                    }
                }
            }
            return 0;
        }
        
        // Fix: Apply this function everywhere: "Comments are also allowed between tokens."
        // Fix: "An annotation in square brackets can be inserted immediately before a 
        //              pattern, param, nameClass, grammarContent or includeContent."
        function checkComment (source, setState) {
            if (source.lookAhead('#')) {
                // Fix: "## comments can only be used immediately before 
                //              a pattern, nameClass, grammarContent or includeContent."
                // Fix: "Any ## comments must precede any annotation in square brackets."
                if (source.lookAheadRegex(/^(?:##.*)+?/, true)) {
                    return 'relax-comment-documentation';
                }
                source.lookAheadRegex(/^(?:#.*)+?/, true);
                return 'relax-comment';
            }
            if (source.lookAhead('[', true)) {
                // Fix: _annotation = '\\[' + _annotationAttribute + '*' + _annotationElement + '*\\]';
            }
            return false;
        }
        
        function annotationElement (source, setState) {
            if (source.lookAheadRegex(new RegExp(_name), true)) {
                return 'relax-annotation-element-name';
            }
            if (source.lookAhead('[', true)) {
                return 'relax-annotation-bracket';
            }
            return ''; // Fix: unfinished
        }
        
        
        
        function followAnnotationElementLiteralOrElement (source, setState) {
            if (source.lookAheadRegex(new RegExp(_literal), true)) {
                setState(followAnnotationElement);
                return 'relax-follow-annotation-element-literal';
            }
            if (source.lookAheadRegex(new RegExp(_name + '\\[)'))) {
                followAnnotationElementElements = true;
                setState(followAnnotationElement);
                return followAnnotationElement(source, setState);
            }
            return 'relax-bad-character';
        }
        function followAnnotationElementInner (source, setState) {
            if (source.lookAheadRegex(new RegExp(_annotationAttribute), true)) {
                if (!source.lookAheadRegex(new RegExp(_annotationAttribute))) {
                    setState(followAnnotationElementLiteralOrElement);
                }
                return 'relax-follow-annotation-attribute';
            }
            return 'relax-bad-character';
        }
        
        function followAnnotationElement (source, setState) {
/*
"It has the following syntax:"
followAnnotationElementLiteralOrElement
_annotationElement = .....  | _literal + ')*\\]',
_annotationElement = _name + '\\[' + _annotationAttribute + '*(' + _annotationElement + | + _literal + ')*\\]',
*/
            if (source.lookAheadRegex(new RegExp(_name), true)) {
                return 'relax-follow-annotation-element-name';
            }
            if (source.lookAhead('[', true)) {
                setState(followAnnotationElementInner);
                return 'relax-follow-annotation-bracket';
            }
            if (followAnnotationElementElements && source.lookAheadRegex(new RegExp(_literal), true)) {
                followAnnotationElementElements = false;
                noMoreFollowAnnotations = true;
                setState(followAnnotationElementLiteralOrElement);
            }
            return checkFollowAnnotation(source, setState);
        }

        // Fix: Invoke: "A pattern or nameClass may be followed by any number of followAnnotations..."
        function checkFollowAnnotation (source, setState) {
            if (source.lookAheadRegex(new RegExp('>>(?=' + _name + '\\[)'), true)) { // beginning of annotationElement
                setState(followAnnotationElement);
                return 'relax-follow-annotation';
            }
            if (noMoreFollowAnnotations) {
                // continue
            }
            return false;
        }
        
        function startPattern (source, setState) {
            
            patternState = 'grammarStart';
            return pattern(source, setState);
        }
        
        function start (source, setState) {
            var assignMethod = source.lookAheadRegex(new RegExp('^' + _assignMethod), true);
            if (assignMethod) {
                // Didn't verify pattern yet
                setState(startPattern);
                switch (assignMethod[0]) {
                    case '&=':
                        return 'relax-grammar-start-interleave';
                    case '|=':
                        return 'relax-grammar-start-choice';
                    case '=':
                        return 'relax-grammar-start-equals';
                    default:
                        throw 'Unexpected value in start';
                }
            }
            throw 'Unexpected value in start';
        }

        function definePattern (source, setState) {
            patternState = 'grammarDefine';
            return pattern(source, setState);
        }
        
        function define (source, setState) {
            var assignMethod = source.lookAheadRegex(new RegExp('^' + _assignMethod), true);
            if (assignMethod) {
                // Didn't verify pattern yet
                setState(definePattern);
                switch (assignMethod[0]) {
                    case '&=':
                        return 'relax-grammar-define-interleave';
                    case '|=':
                        return 'relax-grammar-define-choice';
                    case '=':
                        return 'relax-grammar-define-equals';
                    default:
                        throw 'Unexpected value in define';
                }
            }
            throw 'Unexpected value in define';
        }

        function grammarDiv (source, setState) {
            if (source.lookAhead('{', true)) {
                return 'relax-grammar-div-bracket';          
            }
            divBegin.push('grammarDiv');
            setState(grammarContent);
            return grammarContent(source, setState);
        }
        
        function startDiv (source, setState) {
            if (source.lookAhead('{', true)) {
                return 'relax-include-div-bracket';          
            }
            divBegin.push('includeDiv');
            setState(includeContent);
            return includeContent(source, setState);
        }
        
        function includeContent (source, setState) {
            var start = source.lookAheadRegex(
                new RegExp('^start(?=\\s+' + _assignMethod + ')'), true // We don't check for the complex pattern at the end
                                                                                                      // since no other possible matches from here anyways
            );
            if (start) {
                setState(start);
                return 'relax-include-start';
            }
            var define = source.lookAheadRegex(
                new RegExp('^' + _identifier + _assignMethod) // We don't check for the complex pattern at the end
                                                                                                            // since no other possible matches from here anyways
            );
            if (define) {
                setState(define);
                source.lookAheadRegex(new RegExp('^' + _identifier), true);
                return 'relax-include-define-identifier';
            }
            var div = source.lookAheadRegex(
                new RegExp('^div(?=\\s*\\{)'), true // We don't check for the complex (recursive) grammarContent at the end
                                                                         // since no other possible matches from here anyways
            );
            if (div) {
                grammarContentState = 'includeDiv';
                setState(startDiv);
                return 'relax-include-div';
            }
            
            if (divBegin[divBegin.length-1] === 'includeDiv' && source.lookAhead('}', true)) {
                divBegin.pop();
                // State is still includeContent as always can repeat
                return 'relax-include-div-end-bracket';
            }

            return 'relax-bad-character';            
        }
        
        function includeContentHolder (source, setState) {
            if (source.lookAhead('{', true)) {
                includeBegin.push('grammarContent');
                setState(includeContent);
                return 'relax-include-content-bracket';
            }
            return grammarContent(source, setState);
        }
        
        function includeInherit () {
            if (source.lookAhead('=', true)) {
                return 'relax-include-inherit-equals';
            }
            var idOrKeyword = source.lookAheadRegex(new RegExp('^' + _identifierOrKeyword), true);
            if (idOrKeyword) {
                setState(includeContentHolder);
                return 'relax-include-inherit-identifier';
            }
            throw 'Unexpected value in includeInherit';
        }
        
        function includeOption (source, setState) {
            if (source.lookAheadRegex(new RegExp('^inherit(?=\\s*=\\s*' + _identifierOrKeyword + ')'), true)) {
                setState(includeInherit);
                return 'relax-include-inherit';
            }
            return includeContentHolder(source, setState);
        }
        
        function grammarInclude (source, setState) {
            if (source.lookAheadRegex(_anyURILiteral, true)) {
                setState(includeOption);
                return 'relax-include-anyURI';
            }
            throw 'Unexpected value in grammarInclude';
        }

        function grammarContent (source, setState) {
            var start = source.lookAheadRegex(
                new RegExp('^start(?=\\s+' + _assignMethod + ')'), true // We don't check for the complex pattern at the end
                                                                                                      // since no other possible matches from here anyways
            );
            if (start) {
                setState(start);
                return 'relax-grammar-start';
            }
            var define = source.lookAheadRegex(
                new RegExp('^' + _identifier + _assignMethod) // We don't check for the complex pattern at the end
                                                                                                            // since no other possible matches from here anyways
            );
            if (define) {
                setState(define);
                source.lookAheadRegex(new RegExp('^' + _identifier), true);
                return 'relax-grammar-define-identifier-or-keyword';
            }
            var div = source.lookAheadRegex(
                new RegExp('^div(?=\\s*\\{)'), true // We don't check for the complex (recursive) grammarContent at the end
                                                                         // since no other possible matches from here anyways
            );
            if (div) {
                grammarContentState = 'grammarDiv';
                setState(grammarDiv);
                return 'relax-grammar-div';
            }
            var include = source.lookAheadRegex(
                new RegExp('^include(?=\\s+' + _anyURILiteral + ')'), true // We don't check here for the optional inherit or includeContent 
                                                                                                    // at the end since optional anyways
            );
            if (include) {
                setState(grammarInclude);
                return 'relax-grammar-include';
            }
            
            if (divBegin[divBegin.length-1] === 'grammarDiv' && source.lookAhead('}', true)) {
                divBegin.pop();
                // State is still grammarContent as always can repeat
                return 'relax-grammar-div-end-bracket';
            }
            if (includeBegin[includeBegin.length-1] === 'grammarContent' && source.lookAhead('}', true)) {
                includeBegin.pop();
                // State is still grammarContent as always can repeat
                return 'relax-grammar-include-end-bracket';
            }

            return 'relax-bad-character';
        }
        
        function elementPattern () {
            
        }
        
        function pattern (source, setState) {
            if (source.lookAhead('element', true)) {
                setState(elementPattern);
                return 'relax-element-keyword';
            }
            
            
            if (patternState === 'topLevel') {
                patternState = null;
                setState(grammarContent);
                grammarContentState = 'pattern';
                return grammarContent(source, setState);
            }
            return 'relax-bad-character';
        }
        
        function nsDecl (source, setState) {
            var idOrKeyword = source.lookAheadRegex(new RegExp('^' + _identifierOrKeyword), true);
            if (idOrKeyword) {
                return 'relax-namespace-declaration-identifier-or-keyword';
            }
            if (source.lookAhead('=')) {
                return 'relax-namespace-declaration-equals';
            }
            var nsURI = source.lookAheadRegex(new RegExp('^' + _namespaceURILiteral), true);
            if (nsURI) {
                setState(decl);
                return 'relax-namespace-declaration-namespace-uri';
            }
            throw 'Unexpected value in nsDecl';
        }
        function defaultNsDecl (source, setState) {
            var idOrKeyword = source.lookAheadRegex(new RegExp('^' + _identifierOrKeyword), true);
            if (idOrKeyword) {
                return 'relax-default-namespace-declaration-identifier-or-keyword';
            }
            if (source.lookAhead('=')) {
                return 'relax-default-namespace-declaration-equals';
            }
            var nsURI = source.lookAheadRegex(new RegExp('^' + _namespaceURILiteral), true);
            if (nsURI) {
                setState(decl);
                return 'relax-default-namespace-declaration-namespace-uri';
            }
            throw 'Unexpected value in defaultNsDecl';
        }
        function datatypesDecl (source, setState) {
            var idOrKeyword = source.lookAheadRegex(new RegExp('^' + _identifierOrKeyword), true);
            if (idOrKeyword) {
                return 'relax-default-namespace-declaration-identifier-or-keyword';
            }
            if (source.lookAhead('=')) {
                return 'relax-default-namespace-declaration-equals';
            }
            var nsURI = source.lookAheadRegex(new RegExp('^' + _literal), true);
            if (nsURI) {
                setState(decl);
                return 'relax-default-namespace-declaration-literal';
            }
            throw 'Unexpected value in datatypesDecl';
        }
        
        function decl (source, setState) {
            var ns = source.lookAheadRegex(
                new RegExp('^namespace(?=\\s+' + _identifierOrKeyword + '\\s*=\\s*' +_namespaceURILiteral + ')'), true
            );
            if (ns) {
                setState(nsDecl);
                return 'relax-namespace-declaration';
            }

            var dns = source.lookAheadRegex(
                new RegExp('^default\\s+namespace\\s+' + _identifierOrKeyword + '?\\s*=\\s*' +_namespaceURILiteral)
            );
            if (dns) {
                source.lookAheadRegex(/^default\\s+namespace/, true);
                setState(defaultNsDecl);
                return 'relax-default-namespace-declaration';
            }

            var dts = source.lookAheadRegex(
                new RegExp('^datatypes(?=\\s+' + _identifierOrKeyword + '\\s*=\\s*' +_literal + ')'), true
            );
            if (dts) {
                setState(datatypesDecl);
                return 'relax-datatypes';
            }

            patternState = 'topLevel';
            return pattern(source, setState);
        }

        return function(source, startState) {
            return tokenizer(source, startState || decl);
        };
    })();


    function resetStateVariables () {
        grammarContentState = patternState = followAnnotationElementElements = 
            noMoreFollowAnnotations = undefined;
        divBegin = [], includeBegin = [];
    }

    // Parser
    function parseRelaxNG (source) {
        resetStateVariables();

        var tokens = tokenizeRelaxNG(source);

        var iter = {
            next: function() {
                try {
                    var token = tokens.next(),
                        style = token.style,
                        content = token.content,
                        type = style.replace(/^relax-/, '');

                    switch (type) {
                        // Allow ability to extract information on character equivalence, e.g., for use on tooltips
                        case 'class-extra-escaped': case 'extra-escaped':
                            token.equivalent = content.replace(/^\\/, '');
                            break;
                        default:
                            break;
                    }
                }
                catch (e) {
if (e != StopIteration) {
    alert(e + '::'+e.lineNumber);
}
                    throw e;
                }
                return token;
            },
            copy: function() {
                var _grammarContentState = grammarContentState, _patternState = patternState, _divBegin = divBegin,
                    _followAnnotationElementElements = followAnnotationElementElements,
                    _noMoreFollowAnnotations = noMoreFollowAnnotations,
                    _includeBegin = includeBegin,
                    _tokenState = tokens.state;
                return function(source) {
                    followAnnotationElementElements = _followAnnotationElementElements;
                    noMoreFollowAnnotations = _noMoreFollowAnnotations;
                    grammarContentState = _grammarContentState;
                    patternState = _patternState;
                    divBegin = _divBegin;
                    includeBegin = _includeBegin;
                    tokens = tokenizeRelaxNG(source, _tokenState);
                    return iter;
                };
            }
        };
        return iter;
    }

    // Parser object
    return {
        make: parseRelaxNG,
        configure: function (parserConfig) {
            // Setting with possible overrides
            for (var opt in parserConfig) {
                config[opt] = parserConfig[opt];
            }
        }
    };
})();
