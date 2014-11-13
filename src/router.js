import csp from './csp/csp';
import Stream from './stream';

let defaultRoute = /.*/,
    rootRoute = /^\/$/,
    optionalParam = /\((.*?)\)/g,
    namedParam    = /(\(\?)?:\w+/g,
    splatParam    = /\*\w+/g,
    escapeRegExp  = /[\-{}\[\]+?.,\\\^$|#\s]/g;

// csp.operations.split will block both channels if one channel has write
// information that has not yet been read.
// This function would correct that issue, but is not the correct
// implementation of split.
// Instead, either find a better non-blocking solution,
// or require a default route to always be defined.
/*function split(p, ch, trueBufferOrN, falseBufferOrN) {
    var tch = csp.chan(trueBufferOrN);
    var fch = csp.chan(falseBufferOrN);

    csp.go(function* () {
        while (true) {
            var value = yield csp.take(ch);

            if (value === CLOSED) {
                tch.close();
                fch.close();
                break;
            }

            go(function* () {
                yield csp.put(p(value) ? tch : fch, value);
            });
        }
    });

    return [tch, fch];
}*/

class Route extends Stream {

    constructor (url, router) {
        super();

        this.url = url;
        [this._routech, router.ch] = csp.operations.split((value) => this.url.test(value), router.ch);
    }

    load (page, options) {
        let self = this;

        csp.go(function* () {
            while (true) {
                var route = yield csp.take(self._routech);
                // get parts of route... /path/:id/:name
                // pass captured parts in to functions using spread operator

                if (typeof page === 'string') {
                    System.import(page).then(function (m) { new m.default(options) });
                } else if (typeof page === 'function') {
                    page(route);
                } else if (page && typeof page.load === 'function') {
                    page.load(route);
                } else if (typeof page !== 'undefined') {
                    throw new TypeError('Tried to load an invalid type.');
                }
            }
        });

        // should this create a new instance of Route of something similar and return that
        // with a new channel to allow chaining loads?
        // should there be a different method?
        // can i use alts to make load listen to a couple channels to make this work?
        return this;
    }

}

class Router extends Stream {

    constructor () {
        super();

        this.ch = csp.chan();
        this._ch = this.ch;
        this._navch = csp.chan();

        this.initialize.apply(this, arguments);

        // this.route('path').goto(login).goto(page).load(view1, view2, view3)
        // goto pauses execution before calling the next
        // load executes immediately
    }

    route (route) {
        if (!(route instanceof RegExp)) route = this._convertRoute(route);
        return new Route(route, this);
    }

    default () {
        return new Route(defaultRoute, this);
    }

    root () {
        return new Route(rootRoute, this);
    }

    start (options = {}) {
        let self = this;

        csp.go(function* () {
            csp.operations.pipe(self._navch, self._ch);
        });

        if (!options.silent) {
            csp.go(function* () {
                yield csp.put(self._ch, window.location.pathname);
            });
        }

        return this;
    }

    stop () {
        return this;
    }

    navigate (url, options = {}) {
        let self = this;

        if (options.replace) {
            history.replaceState(options.state || null, document.title, url);
        } else {
            history.pushState(options.state || null, document.title, url);
            csp.go(function* () {
                yield csp.put(self._navch, url);
            });
        }

        return this;
    }

    _convertRoute (route) {
        route = route.replace(escapeRegExp, '\\$&')
                     .replace(optionalParam, '(?:$1)?')
                     .replace(namedParam, (match, optional) => optional ? match : '([^/?]+)')
                     .replace(splatParam, '([^?]*?)');

       return new RegExp(`^\/${route}`);
    }

}

export default Router;
