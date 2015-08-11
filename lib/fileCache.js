/**
 * Created by kitolog on 10.08.15.
 */

/**
 *
 * env vars:
 * CACHE_ROOT_DIR - cache dir path
 * DEV_MODE - dev mode with console logs
 * CACHE_LIVE_TIME - cache live time
 *
 * usage:
 * export CACHE_ROOT_DIR='/some_path/prerender/cache'
 * export DEV_MODE=true
 * export CACHE_LIVE_TIME=10000 (in seconds)
 */

var cache_manager = require('cache-manager');
var fs = require('node-fs');
var fileName = '___';

var logger = function (msg) {
    var devMode = process.env.DEV_MODE;
    if (devMode) {
        console.log(msg);
    }
};

var getFilePath = function (url) {
    var request_url,
        pattern = RegExp("^(https?://)?([^#?]+)");

    var matches = url.match(pattern);
    request_url = matches[2];

    return request_url;
};

module.exports = {
    init: function () {
        this.cache = cache_manager.caching({
            store: file_cache
        });
    },

    beforePhantomRequest: function (req, res, next) {
        var _this = this;
        var isRecache = false;
        logger('beforePhantomRequest');
        if ((typeof req != 'undefined') && (typeof req.url != 'undefined')) {
            var currentUrl = req.prerender.url;
            logger('currentUrl');
            logger(currentUrl);
            if (currentUrl.indexOf('recache') > -1) {
                var pattern = /((&|)recache([=a-zA-Z0-9]*|))/;
                var resultUrl = currentUrl.replace(pattern, "", "$1");
                if (resultUrl && resultUrl.length) {
                    currentUrl = resultUrl;
                    req.prerender.url = resultUrl;
                }

                logger('Recache');
                isRecache = true;
                this.cache.del(currentUrl, function (err) {
                    logger('Deleted');
                    if (err) {
                        logger('Error');
                        logger(err);
                    }

                    if (!err) {
                        _this.cache.get(currentUrl, function (err, result) {
                            logger('Get result');

                            if (err) {
                                logger('Error');
                                logger(err);
                            }

                            if (result) {
                                logger('Result');
                                logger(result);
                            }

                            if (!err && result) {
                                var now = new Date();
                                logger(now.toDateString() + ' ' + now.toTimeString() + ' cache hit');
                                res.send(200, result);
                            } else {
                                next();
                            }
                        });
                    }
                });
            }
        }

        if (!isRecache) {
            if (req.method !== 'GET') {
                return next();
            }

            this.cache.get(req.prerender.url, function (err, result) {
                if (!err && result) {
                    var now = new Date();
                    logger(now.toDateString() + ' ' + now.toTimeString() + ' cache hit');
                    res.send(200, result);
                } else {
                    next();
                }
            });
        }
    },

    afterPhantomRequest: function (req, res, next) {
        if (req.prerender.statusCode == 200) {

            var resultHTML = req.prerender.documentHTML;
            logger('documentHTML');
            //logger(resultHTML);
            var bodyOpenTag = '<body',
                bodyCloseTag = '</body>';
            if ((typeof resultHTML != 'undefined')
                && resultHTML.length
                && (resultHTML.indexOf(bodyOpenTag) > -1)
                && (resultHTML.indexOf(bodyCloseTag) > -1)
                && ((resultHTML.indexOf(bodyCloseTag) - resultHTML.indexOf(bodyOpenTag) - bodyOpenTag.length - 1) > 0)
            ) {
                logger('Set result to file');
                this.cache.set(req.prerender.url, req.prerender.documentHTML, function (err) {
                    logger('AFTER ERROR');
                    logger(err);
                });
                next();
            } else {
                if (typeof req.prerender['retryNumber'] == 'undefined') {
                    req.prerender['retryNumber'] = 1;
                }

                logger('Empty body, retry (' + req.prerender['retryNumber'] + ')');

                if (req.prerender['retryNumber'] < 4) {
                    req.prerender['retryNumber']++;
                    this.cache.get(req.prerender.url, function (err, result) {
                        if (!err && result) {
                            var now = new Date();
                            logger(now.toDateString() + ' ' + now.toTimeString() + ' cache hit');
                            res.send(200, result);
                        } else {
                            next();
                        }
                    });
                }
            }
        }
    }
};


var file_cache = {
    get: function (key, callback) {
        var path = process.env.CACHE_ROOT_DIR;
        var cache_live_time = process.env.CACHE_LIVE_TIME;

        var request_url = getFilePath(key);
        logger(request_url);

        if (typeof request_url !== "undefined") {
            path = path + '/' + request_url + '/' + fileName;
        } else {
            path = path + '/' + fileName;
        }

        fs.exists(path, function (exists) {
            if (exists === false) {
                return callback(null)
            }

            var date = new Date();

            if ((date.getTime() - fs.statSync(path).mtime.getTime() > cache_live_time * 1000) || (fs.statSync(path).size < 40)) {
                return callback(null)
            }

            fs.readFile(path, callback);
        });

    },
    set: function (key, value, callback) {

        var path = process.env.CACHE_ROOT_DIR;

        var request_url = getFilePath(key);

        if (typeof request_url !== "undefined") {
            path = path + '/' + request_url;
        }

        fs.exists(path, function (exists) {
            if (exists === false) {
                fs.mkdirSync(path, '0777', true);
            }

            fs.writeFile(path + '/' + fileName, value, function (err, data) {
                callback(err);

                if (err) {
                    return logger(err);
                }
                logger(data);
            });

        });

    },
    del: function (key, callback) {
        var path = process.env.CACHE_ROOT_DIR;
        var cache_live_time = process.env.CACHE_LIVE_TIME;

        var request_url = getFilePath(key);

        if (typeof request_url !== "undefined") {
            path = path + '/' + request_url + '/' + fileName;
        } else {
            path = path + '/' + fileName;
        }

        fs.exists(path, function (exists) {
            if (exists === false) {
                return callback(null)
            }

            var date = new Date();

            if (date.getTime() - fs.statSync(path).mtime.getTime() > cache_live_time * 1000) {
                return callback(null)
            }

            fs.unlink(path, callback);
        });
    }
};