/**
 * LIBRARY: jsNumberFormatter
 * COMPONENT: -
 * DESCRIPTION: A pure JS implementation of number parsing and formatting.
 * FILENAME: jsNumberFormatter.js
 * DATE: 2014-06-17
 * AUTHOR: Andrew G Parry
 * SOURCE: https://github.com/andrewgp/jsNumberFormatter
 * 
 * VERSION: 0.4
 * STATE: Alpha
 * DEPENDANCIES: -
 * 
 * STATUS:
 * 
 * + Formatting
 *   - Needs some tuning of the repeating groups
 * 
 * CHANGELOG:
 * 
 * LICENSE:
 * 
 * The MIT License (MIT)
 * Copyright (c) 2014 Andrew G Parry
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

var JsNumberFormatter = {
    
    
    /*  CONSTANTS   */
    
    
    // all constants
    consts: {
        regexStrNonNumeric: '[^0-9\\.]',
        negativeParanRegex: '^\\(([^\\)]+)\\)$',
        numberRegex: new RegExp('^([0-9]*)\\.([0-9]*)$'),
        maskCharsStr: '[0#]',
        maskCharsRegex: new RegExp('[0#]', 'g')
    },
    
    
    /*  PARSING */
    
    
    /**
     * Parses a number very simply and quickly.
     */
    parseNumberSimple: function(numberString, options, log, extraModules) {
        // handle log param
        log = typeof log !== 'undefined' ? log : false;
        
        // check other params
        if (log) {
            console.log('[' + numberString + '] Checking params...');
        }
        if (typeof numberString != 'string') {
            throw new TypeError('Expecting a string as numberString param');
        }
        options = typeof options !== 'undefined' ? options : new this.parseNumberSimpleOptions();
        // if (typeof options != 'parseNumberSimpleOptions') {
        //     throw new TypeError('Options param expected=parseNumberSimpleOptions actual=' + typeof option);
        // }
        if (log) {
            console.log('[' + numberString + '] Options=' + options.print());
            console.log('[' + numberString + '] Params OK');
        }
        
        var newNumberString = numberString;
        var context = new this.parseContext(log, options, this);
        var operators = options.compileOperators(this, false);
        
        // process operators
        var i;
        for (i = 0; i < operators.operators.length; i++) {
            newNumberString = operators.operators[i].parse(numberString, newNumberString, context);
        }
        if (typeof extraModules !== 'undefined') {
            for (i = 0; i < extraModules.length; i++) {
                newNumberString = operators.operators[i].parse(numberString, newNumberString, context);
            }
        }
        
        // post-process operators
        context.isPost = true;
        for (i = 0; i < operators.operators.length; i++) {
            newNumberString = operators.operators[i].postParse(numberString, newNumberString, context);
        }
        if (typeof extraModules !== 'undefined') {
            for (i = 0; i < extraModules.length; i++) {
                newNumberString = operators.operators[i].postParse(numberString, newNumberString, context);
            }
        }
        
        // finally try to parse/force to a javascript number (if needed)
        var result;
        if (typeof newNumberString === 'Number') {
            result = newNumberString;
        } else {
            result = new Number(newNumberString);
        }
        if (isNaN(result)) {
            throw new NaNError();
        }
        
        // final rounding
        if (options.roundingDecimalPlaces >= 0) {
            result = JsNumberFormatter.util.round(result, options.roundingDecimalPlaces, log,
                                                  result < 0, options.roundingMode);
        }
        
        if (log) {
            console.log('Output: ' + result);
        }
        
        return result;
    },
    
    // holder of the operators (functions in this case) that can be used to process a string parse
    parseOperators: function() {
        this.operators = [ ];
        
        this.add = function(op) {
            this.operators[this.operators.length] = op; 
        };
    },
    
    // context when operators are called during parsing
    parseContext: function(log, options, nf) {
        this.log = log;
        this.options = options;
        this.nf = nf;
        
        this.isNegative = false;
        
        this.isPerc = false;
        
        this.isPost = false;
    },
    
    // options used during parsing
    parseNumberSimpleOptions: function() {
        this.decimalStr = '.';
        this.groupStr = ',';
        this.strict = false;
        this.trim = true;
        this.removeBadCh = false;
        
        // negative numbers support
        this.negativeMatch = new RegExp('^-(.+)');
        
        // percentage support
        this.percEnabled = false;
        this.percMatch = new RegExp('^(.+)%');
        
        // operators cache
        this.operatorsCached = null;
        
        // rounding
        this.roundingDecimalPlaces = -1; // unlimited
        this.roundingMode = JsNumberFormatter.util.RoundHalfUp;
        
        /**
         * Specifies all the main options.
         */
        this.specifyAll = function(decimalStr, groupStr, strict, trim, removeBadCh, negativeMatch) {
            // check params
            if (typeof decimalStr !== 'undefined') {
                if (typeof decimalStr !== 'string') {
                    throw new TypeError('Expecting a string as decimalStr param');
                }
                this.decimalStr = decimalStr;
            }
            if (typeof groupStr !== 'undefined') {
                if (typeof groupStr !== 'string') {
                    throw new TypeError('Expecting a string as groupStr param');
                }
                this.groupStr = groupStr;
            }
            this.specifyStrict(strict);
            this.specifyTrim(trim);
            this.specifyRemoveBadCh(removeBadCh);
            this.specifyNegativeMatch(negativeMatch);
            
            return this;
        };
        
        this.specifyStrict = function(strict) {
            if (typeof strict !== 'undefined') {
                if (typeof strict !== 'boolean') {
                    throw new TypeError('Expecting a boolean as strict param');
                }
                this.strict = strict;
            }
            return this;
        };
        
        this.specifyTrim = function(trim) {
            if (typeof trim !== 'undefined') {
                if (typeof trim !== 'boolean') {
                    throw new TypeError('Expecting a boolean as trim param');
                }
                this.trim = trim;
            }
            return this;
        };
        
        this.specifyRemoveBadCh = function(removeBadCh) {
            if (typeof removeBadCh !== 'undefined') {
                if (typeof removeBadCh !== 'boolean') {
                    throw new TypeError('Expecting a boolean as removeBadCh param');
                }
                this.removeBadCh = removeBadCh;
            }
            return this;
        };
        
        this.specifyNegativeMatch = function(negativeMatch) {
            if (typeof negativeMatch !== 'undefined') {
                if (typeof negativeMatch !== 'string') {
                    throw new TypeError('Expecting a string as negativeMatch param');
                }
                this.negativeMatch = new RegExp(negativeMatch);
            }
            return this;
        };
        
        /**
         * Toggles and specifies percentage detection.
         */
        this.specifyPerc = function(enabled, match) {
            this.percEnabled = enabled;
            if (typeof match !== 'undefined') {
                if (typeof match !== 'string') {
                    throw new TypeError('Expecting a string as match param');
                }
                this.percMatch = new RegExp(match);
            }
            return this;
        };
        
        this.specifyRounding = function(roundingMode, decimalPlaces) {
            if (typeof roundingMode === 'undefined') {
                throw new TypeError('Expecting a number for roundingMode param');
            }
            if (typeof roundingMode !== 'number') {
                throw new TypeError('Expecting a number for roundingMode param');
            }
            if (typeof decimalPlaces !== 'undefined') {
                if (typeof decimalPlaces !== 'number') {
                    throw new TypeError('Expecting a number for decimalPlaces param');
                }
                this.roundingDecimalPlaces = decimalPlaces;
            }
            this.roundingMode = roundingMode;
            return this;
        };
        
        this.print = function() {
            return 'parseNumberSimpleOptions{decimalStr:"' + this.decimalStr
                + '",groupStr:"' + this.groupStr
                + '",strict:"' + this.strict
                + '",trim:"' + this.trim
                + '",removeBadCh:"' + this.removeBadCh
                + '",negativeMatch:"' + this.negativeMatch
                + '"}';
        };
        
        this.compileOperators = function(nf, rebuild) {
            if (this.operatorsCached === null || rebuild) {
                this.operatorsCached = new nf.parseOperators();
                
                // add operators
                if (this.trim) {
                    this.operatorsCached.add(new JsNumberFormatter.modules.Trim());
                }
                if (this.negativeMatch) {
                    this.operatorsCached.add(new JsNumberFormatter.modules.NegativeNumber());
                }
                this.operatorsCached.add(new JsNumberFormatter.modules.FormattedNumber());
                if (this.percEnabled) {
                    this.operatorsCached.add(new JsNumberFormatter.modules.Percentage());
                }
                if (this.removeBadCh) {
                    this.operatorsCached.add(new JsNumberFormatter.modules.BadChars());
                }
            }
            return this.operatorsCached;
        };
	},
    
    
    /*  FORMATTING  */
    
    
    /**
     * Formats a number (object) into a string, based on the options.
     */
    formatNumber: function(number, options, log) {
        // handle log param
        log = typeof log !== 'undefined' ? log : false;
        
        // check other params
        if (log) {
            console.log('[' + number + '] Checking params...');
        }
        if (typeof number != 'number') {
            throw new TypeError('Expecting a number as number param');
        }
        options = typeof options !== 'undefined' ? options : new this.formatNumberOptions();
        if (log) {
            console.log('[' + number + '] Options=' + options.print());
            console.log('[' + number + '] Params OK');
        }
        
        // Compile masks
        if (!options.compiled) {
            if (log) {
                console.log('Compiling options...');
            }
            options.compile(new this.formatMaskCompiled(options.groupMaskStr), new this.formatMaskCompiled(options.decimalMaskStr), log);
        }
        
        // get just the decimal part length
        var decimalLen = 0;
        var match = this.consts.numberRegex.exec(number);
        if (match) {
            decimalLen = match[2].length;
        }
        
        // do any rounding
        if (options.decimalMaskStr.length < decimalLen) {
            number = JsNumberFormatter.util.round(number, options.decimalMaskStr.length, log,
                                                  number < 0, options.roundingMode);
        }
        
        // break up number into 2 strings, 1 for the integer and 1 for the decimals
        if (log) {
            console.log('Splitting number to parts...');
        }
        
        match = this.consts.numberRegex.exec(number);
        var integerPartStr;
        var decimalPartStr;
        if (match) {
            // has 2 parts
            integerPartStr = match[1];
            decimalPartStr = match[2];
        } else {
            // likely only 1 part, or something is wrong!
            integerPartStr = number;
            decimalPartStr = '';
        }
        decimalLen = decimalPartStr.length;
        if (log) {
            console.log('Parts=integer:' + integerPartStr + ',decimal:' + decimalPartStr);
        }
        
        // apply group mask
        if (log) {
            console.log('Applying group mask...');
        }
        var formatterIntPartStr = options.groupMask.apply(integerPartStr);
        
        // apply decimal mask
        if (log) {
            console.log('Applying decimal mask...');
        }
        var formatterDecPartStr = options.decimalMask.apply(decimalPartStr);
        
        // build final response
        // TODO needs more here
        var result;
        if (formatterDecPartStr.length > 0) {
            result = formatterIntPartStr + options.decimalSeperatorStr + formatterDecPartStr;
        } else {
            result = formatterIntPartStr;
        }
        
        // apply prefix & postfix (if available)
        if (options.prefix !== null) {
            result = options.prefix + result;
        }
        if (options.postfix !== null) {
            result = result + options.postfix;
        }
        
        if (log) {
            console.log('Result=' + result);
        }
        return result;
    },
    
    formatNumberOptions: function() {
        this.groupMaskStr = ',###';
        this.decimalSeperatorStr = '.';
        this.decimalMaskStr = '##';
        this.negativeMaskStr = '-(.+)';
        this.prefix = null;
        this.postfix = null;
        
        this.groupMask = null;
        this.decimalMask = null;
        this.compiled = false;
        
        this.numberMaskValidRegex = new RegExp('[#0]', 'g');
        
        // rounding support
        this.roundingMode = JsNumberFormatter.util.RoundHalfUp;
        
        this.specifyAll = function(groupMaskStr, decimalMaskStr, decimalSeperatorStr, negativeMaskStr) {
            // check basic params integrity and handle actually apply the changes
            if (typeof groupMaskStr !== 'undefined') {
                if (typeof groupMaskStr !== 'string') {
                    throw new TypeError('Expecting a string as groupMaskStr param');
                }
                this.groupMaskStr = groupMaskStr;
            }
            if (typeof decimalMaskStr !== 'undefined') {
                if (typeof decimalMaskStr !== 'string') {
                    throw new TypeError('Expecting a string as decimalMaskStr param');
                }
                this.decimalMaskStr = decimalMaskStr;
            }
            if (typeof decimalSeperatorStr !== 'undefined') {
                if (typeof decimalSeperatorStr !== 'string') {
                    throw new TypeError('Expecting a string as decimalSeperatorStr param');
                }
                this.decimalSeperatorStr = decimalSeperatorStr;
            }
            if (typeof negativeMaskStr !== 'undefined') {
                if (typeof negativeMaskStr !== 'string') {
                    throw new TypeError('Expecting a string as negativeMaskStr param');
                }
                this.negativeMaskStr = negativeMaskStr;
            }
            
            // validate param values
            var match = groupMaskStr.match(this.numberMaskValidRegex);
            if (!match || match.length === 0) {
                throw new Error('groupMaskStr must have at least 1 "0" or "#" char');
            }
            
            match = decimalMaskStr.match(this.numberMaskValidRegex);
            if (!match || match.length === 0) {
                throw new Error('decimalMaskStr must have at least 1 "0" or "#" char');
            }
            
            return this;
        };
        
        this.specifyDecimalMask = function(decimalMaskStr) {
            var match = decimalMaskStr.match(this.numberMaskValidRegex);
            if (!match || match.length === 0) {
                throw new Error('decimalMaskStr must have at least 1 "0" or "#" char');
            }
            this.decimalMaskStr = decimalMaskStr;
            return this;
        };
        
        this.specifyFixes = function(prefix, postfix) {
            this.prefix = prefix;
            if (typeof postfix !== 'undefined') {
                if (typeof postfix !== 'string') {
                    throw new TypeError('Expecting a string for postfix param');
                }
                this.postfix = postfix;
            }
            return this;
        };
        
        this.specifyRounding = function(roundingMode) {
            if (typeof roundingMode === 'undefined') {
                throw new TypeError('Expecting a number for roundingMode param');
            }
            if (typeof roundingMode !== 'number') {
                throw new TypeError('Expecting a number for roundingMode param');
            }
            this.roundingMode = roundingMode;
            return this;
        };
        
        this.print = function() {
            return 'parseNumberSimpleOptions{groupMaskStr:"' + this.groupMaskStr
                + '",decimalMaskStr:"' + this.decimalMaskStr
                + '",decimalSeperatorStr:"' + this.decimalSeperatorStr
                + '",negativeMaskStr:"' + this.negativeMaskStr
                + '"}';
        };
        
        this.compile = function(groupMask, decimalMask, log) {
            if (!this.compiled) {
                this.groupMask = groupMask;
                this.groupMask.reversed = true;
                this.groupMask.repeating = true;
                this.groupMask.compile(log);
                
                this.decimalMask = decimalMask;
                this.decimalMask.reversed = false;
                this.decimalMask.repeating = false;    // TODO allow repeating here
                this.decimalMask.compile(log);
            }
        };
    },
    
    formatMaskCompiled: function(maskStr) {
        this.maskStr = maskStr;
        this.repeating = false;
        this.reversed = false;
        
        this.compiled = false;
        this.maskDigitSize = -1;
        
        this.roundingMode = JsNumberFormatter.util.RoundHalfUp;
        
        this.apply = function(pureNumericStr, log) {
            if (!this.compiled) {
                throw new Error('Mask not compiled');
            }
            
            pureNumericStr = '' + pureNumericStr;
            
            if (log) {
                console.log('Applying mask:"' + this.maskStr + '",reversed=' + this.reversed + ',input="' + pureNumericStr + '"');
            }
            var result = '';
            if (this.repeating) {
                if (this.reversed) {
                    var strLen = pureNumericStr.length;
                    if (log) {
                        console.log('length=' + strLen);
                    }
                    for (var pos = strLen; pos >= 0; pos -= this.maskDigitSize) {    // FIXME going to truncate?
                        // break into the digits to format
                        if (log) {
                            console.log('Pos:' + pos);
                        }
                        var bottomBound = pos - this.maskDigitSize < 0 ? 0 : pos - this.maskDigitSize;
                        var subDigits = strLen === 1 ? ('' + pureNumericStr).substring(bottomBound, pos) : pureNumericStr.substring(bottomBound, pos);
                        
                        var newStr = this._applyReverseMask(maskStr, subDigits, bottomBound > 0, log);
                        if (newStr === '') {
                            break;
                        }
                        result = newStr + result;
                    }
                } else {
                    // TODO
                }
                
                return result;
            } else {
                result = this.reversed ? this._applyReverseMask(maskStr, pureNumericStr, false, log) : this._applyMask(maskStr, pureNumericStr, log);
            }
            return result;
        };
        
        this.compile = function(log) {
            var match = this.maskStr.match(new RegExp('[0#]', 'g'));
            this.maskDigitSize = match.length;
            if (log) {
                console.log('Compiled at length:' + this.maskDigitSize);
            }
            this.compiled = true;
        };
        
        this._applyMask = function(maskStr, pureNumericStr, log) {
            var result = '';
            // sanity check
            if (maskStr.length < pureNumericStr.length) {
                throw new Error('Mask is not long enough, mask:"' + maskStr + '",number="' + pureNumericStr + '"');
            }
            
            // walk through mask and number together
            var strLen = typeof pureNumericStr.length === 'undefined' ? 1 : pureNumericStr.length;
            for (var i = 0; i < maskStr.length; i++) {
                var maskCh = maskStr.charAt(i);
                
                if (i < strLen) {
                    // still numbers to insert
                    var digit = pureNumericStr.charAt(i);

                    if (maskCh === '0' || maskCh == '#') {
                        // write digit as-is
                        result += digit;
                    } else {
                        // write it out as is
                        result += maskCh;
                    }
                } else {
                    // no more numbers to insert
                    if (log) {
                        console.log('Mask ch:' + maskCh);
                    }
                    if (maskCh === '0') {
                        // zero padding
                        if (log) {
                            console.log('Zero pad');
                        }
                        result += '0';
                    } else if (maskCh == '#') {
                        // no more padding or formatting chars, break the mask
                        break;
                    } else {
                        result += maskCh;
                        
                        // no more padding or formatting chars, break the mask
                        break;
                    }
                }
            }
            
            // special consideration to completely optional masks
            if (result == '0' && maskStr.charAt(maskStr.length - 1) == '#') {
                result = '';
            }
            
            if (log) {
                console.log('Mask result=' + result);
            }
            return result;
        };
        
        this._applyReverseMask = function(maskStr, pureNumericStr, areMore, log) {
            if (log) {
                console.log('Applying reverse mask:"' + maskStr + '"areMore:' + areMore + ',str:"' + pureNumericStr + '"');
            }
            var result = '';
            // sanity check
            if (maskStr.length < pureNumericStr.length) {
                throw new Error('Mask is not long enough, mask:"' + maskStr + '",number="' + pureNumericStr + '"');
            }
            
            // walk through mask and number together (backwards)
            var digitPos = pureNumericStr.length - 1;
            var holdChars = null;
            for (var i = maskStr.length - 1; i >= 0; i--) {
                var maskCh = maskStr.charAt(i);
                if (log) {
                    console.log('Mask ch:' + maskCh);
                }
                
                if (digitPos >= 0) {
                    if (log) {
                        console.log('Digit Pos:' + digitPos);
                    }
                    // still numbers to insert
                    if (maskCh === '0' || maskCh == '#') {
                        var digit = pureNumericStr.charAt(digitPos);
                        if (log) {
                            console.log('Digit:' + digit);
                        }
                        digitPos--;
                        
                        // write out any held chars
                        if (holdChars !== null) {
                            if (log) {
                                console.log('Writing hold chars:' + holdChars);
                            }
                            result = holdChars + result;
                            holdChars = null;
                        }
                        
                        // write digit as-is
                        result = digit + result;
                    } else {
                        // hold the char
                        holdChars = holdChars !== null ? maskCh + holdChars : maskCh;
                        if (log) {
                            console.log('Held char:' + maskCh);
                        }
                    }
                } else {
                    // no more numbers to insert
                    if (maskCh === '0') {
                        // write out any held chars
                        if (null !== holdChars) {
                            if (log) {
                                console.log('Writing hold chars:' + holdChars);
                            }
                            result = holdChars + result;
                            holdChars = null;
                        }
                        
                        // zero padding
                        result = '0' + result;
                    } else if (maskCh == '#') {
                        // no more padding or formatting chars, break the mask
                        break;
                    } else {
                        holdChars = holdChars !== null ? maskCh + holdChars : maskCh;
                        if (log) {
                            console.log('Held char:' + maskCh);
                        }
                    }
                }
            }
            if (areMore && holdChars !== null) {
                result = holdChars + result;
            }
            
            // special consideration to completely optional masks
            if (result == '0' && maskStr.charAt(maskStr.length - 1) == '#') {
                result = '';
            }
            
            if (log) {
                console.log('Mask result=' + result);
            }
            return result;
        };
    },
    
    
    /*  UTILITY  */
    
    
    util: {
        RoundHalfUp: 0,
        RoundHalfDown: 1,
        RoundAwayFromZero: 2,
        RoundTowardsZero: 3,
        
        round: function(value, decimals, log, isNeg, mode) {
            if (typeof mode === 'undefined') {
                mode = JsNumberFormatter.util.RoundHalfUp;
            }
            
            if (log) {
                console.log('Rounding ' + value + ' using mode=' + mode);
            }
            
            var result;
            if (mode === JsNumberFormatter.util.RoundHalfUp) {
                // half-up
                result = Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
            } else if (mode === JsNumberFormatter.util.RoundHalfDown) {
                // half-down
                var diff = 5 / Math.pow(10, decimals + 1);
                value = value - diff;
                result = Number(Math.ceil(value + 'e' + decimals) + 'e-' + decimals);
            } else if (mode === JsNumberFormatter.util.RoundAwayFromZero) {
                // away from zero
                if (isNeg) {
                    result = Number(Math.floor(value + 'e' + decimals) + 'e-' + decimals);
                } else {
                    result = Number(Math.ceil(value + 'e' + decimals) + 'e-' + decimals);
                }
            } else if (mode === JsNumberFormatter.util.RoundTowardsZero) {
                // towards zero
                if (isNeg) {
                    result = Number(Math.ceil(value + 'e' + decimals) + 'e-' + decimals);
                } else {
                    result = Number(Math.floor(value + 'e' + decimals) + 'e-' + decimals);
                }
            } else {
                throw new Error('Unknown rounding mode:"' + mode);
            }
            
            if (log) {
                console.log('[' + value + '] Rounded to ' + result);
            }
            return result;
        },
        
        HashMap: function() {
            this._dict = {};
            this._shared = {id: 1};
            this._size = 0;
            this.put = function put(key, value) {
                if (typeof key == "object") {
                    if (!key.hasOwnProperty._id) {
                        key.hasOwnProperty = function(key) {
                            return Object.prototype.hasOwnProperty.call(this, key);
                        };
                        key.hasOwnProperty._id = this._shared.id++;
                    }
                    key = key.hasOwnProperty._id;
                }
                if (typeof this._dict[key] === 'undefined') {
                    this._size++;
                }
                
                this._dict[key] = value;
                return this;
            };
            
            this.get = function get(key) {
                if (typeof key == "object") {
                    return this._dict[key.hasOwnProperty._id];
                }
                return this._dict[key];
            };
            
            this.size = function() {
                return this._size;
            };
        }
    },
    
    
    /*  MODULES  */
    
    /**
     * Module for basic number parsing.
     */
    modules: {
        FormattedNumber: function() {
            this.parse = function(origValue, currentValue, context) {
                // strip out the group occurrances
                var groupSep = context.options.groupStr;
                if (context.log) {
                    console.log(groupSep);
                }
                groupSep = groupSep.replace(new RegExp('\\.', 'g'), '\\.');
                if (context.log) {
                    console.log(groupSep);
                }
                currentValue = currentValue.replace(new RegExp(groupSep, 'g'), '');
                if (context.log) {
                    console.log('[' + currentValue + '] Removed groups...');
                }
                
                // replace the decimal separator (if needed)
                if (context.options.decimalStr != '.') {
                    currentValue = currentValue.replace(new RegExp(context.options.decimalStr, 'g'), '.');
                    if (context.log) {
                        console.log('[' + currentValue + '] Replaced decimal point(s)...');
                    }
                }
                
                // handle strict options
                if (context.options.strict) {
                    // check that there is 0 or 1 occurrances of the decimal point
                    if (context.log) {
                        console.log('[' + currentValue + '] Counting decimal points...');
                    }
                    var count = currentValue.match(new RegExp('\\.', 'g')).length;
                    if (count > 1) {
                        throw new Error('Input has more than 1 decimal point: ' + count);
                    }
                    
                    if (!context.options.removeBadCh) {
                        // flag any non numerics
                        if (context.log) {
                            console.log('[' + currentValue + '] Counting disallowed chars...');
                        }
                        count = currentValue.match(new RegExp(context.nf.consts.regexStrNonNumeric, 'g')).length;
                        if (count > 0) {
                            throw new Error('Input has ' + count + ' disallowed chars: ' + currentValue);
                        }
                    }
                }
                
                return currentValue;
            };
            
            this.postParse = function(origValue, currentValue, context) { return currentValue; };
        },
    
        BadChars: function() {
            this.parse = function(origValue, currentValue, context) {
                if (context.options.removeBadCh) {
                    if (context.log) {
                        console.log('[' + currentValue + '] Removing bad chars...');
                    }
                    currentValue = currentValue.replace(new RegExp(context.nf.consts.regexStrNonNumeric, 'g'), '');
                    if (context.log) {
                        console.log('[' + currentValue + '] Removed bad chars...');
                    }
                }
                return currentValue;
            };
            
            this.postParse = function(origValue, currentValue, context) { return currentValue; };
        },
    
    
        /**
         * Module for trimming.
         */
        Trim: function() {
            this.parse = function(origValue, currentValue, context) {
                if (context.options.trim) {
                    currentValue = currentValue.replace(new RegExp('^\\s+|\\s+$', 'g'), '');
                    if (context.log) {
                        console.log('[' + currentValue + '] Trimmed');
                    }
                }
                return currentValue;
            };
            
            this.postParse = function(origValue, currentValue, context) { return currentValue; };
        },
    
        NegativeNumber: function() {
            this.parse = function(origValue, currentValue, context) {
                // determine if a negative number string or not
                if (context.options.negativeMatch) {
                    if (context.log) {
                        console.log('[' + currentValue + '] Removing any negative signs...');
                    }
                    var match = context.options.negativeMatch.exec(currentValue);
                    if (match) {
                        currentValue = match[1];
                        context.isNegative = true;
                        if (context.log) {
                            console.log('[' + currentValue + '] Removed negative sign and any fixes');
                        }
                    }
                }
                
                return currentValue;
            };
        
            this.postParse = function(origValue, currentValue, context) {
                // add prefix to parsed number if a negative one
                if (context.isNegative) {
                    currentValue = '-' + currentValue;
                }
                return currentValue;
            };
        },
    
        /**
         * Module for percentage handling.
         */
        Percentage: function() {
            this.parse = function(origValue, currentValue, context) {
                if (context.options.percEnabled) {
                    var match = context.options.percMatch.exec(currentValue);
                    if (match) {
                        currentValue = match[1];
                        context.isPerc = true;
                        if (context.log) {
                            console.log('[' + currentValue + '] is percentage');
                        }
                    }
                }
                return currentValue;
            };
            
            this.postParse = function(origValue, currentValue, context) {
                if (context.isPerc) {
                    // work out existing dps
                    var dpCount = currentValue.indexOf(context.options.decimalStr);
                    if (dpCount >= 0) {
                        dpCount = currentValue.length - (dpCount + 1) + 2;
                    } else {
                        dpCount = 2;
                    }
                    
                    // divide by 100
                    var preResult = new Number(currentValue);
                    currentValue = preResult /= 100;
                    
                    // force some rounding to the dp we expected
                    currentValue = JsNumberFormatter.util.round(currentValue, dpCount, context.log, context.isNegative);
                    
                    if (context.log) {
                        console.log('[' + currentValue + '] Converted to percentage...');
                    }
                }
                return currentValue;
            };
        }
    }
};


/*  EXCEPTIONS  */


function NaNError(message) {
    this.name = "NaNError";
    this.message = ("NaN " || message);
}
NaNError.prototype = Error.prototype;


/*  MISC    */


// export for RequireJS support (mainly to allow mocha to work)
//module.exports.nf = JsNumberFormatter;
