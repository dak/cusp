import csp from './csp/csp';
import Stream from './stream';

// TODO: Look into storing rendered html in a trie and memoizing the render function
//       http://calendar.perfplanet.com/2013/diff/

let delegateEventSplitter = /^(\S+)\s*(.*)$/;

function config (options) {
    let viewOptions = ['el', 'model', 'events'];

    for (let i = 0, len = viewOptions.length; i < len; i++) {
        let property = viewOptions[i],
            option = options[property] || this[property];

        if (typeof option === 'function') {
            this[property] = option.apply(this);
        } else if (option !== undefined) {
            this[property] = option;
        }
    }
}

class Region {

    constructor (el, parent) {
        if (typeof el === 'string') {
            this.el = document.querySelector(el);
        } else {
            this.el = el;
        }

        this.parent = parent;
        this.controllers = [];
    }

    show (controller) {
        this.empty();
        return this.append(controller);
    }

    append (controller) {
        if (typeof controller === 'function') {
            controller = new controller();
        }

        controller.parent = this.parent;
        this.controllers = this.controllers || [];
        this.controllers.push(controller);
        this.el.appendChild(controller.setElement());
        controller.render();

        return controller;
    }

    empty () {
        for (let i = 0, len = this.controllers.length; i < len; i++) {
            this.controllers[i].close();
        }

        while (this.el.firstChild) {
            this.el.removeChild(this.el.firstChild);
        }

        delete this.controllers;
    }

    close () {
        this.empty();
        delete this.el;
        delete this.parent;
    }

}

class Regions {

    constructor (regions = {}, controller) {
        let keys = Object.keys(regions);

        for (let i = 0, len = keys.length; i < len; i++) {
            this[keys[i]] = new Region(regions[keys[i]], controller);
        }

        this.self = new Region(controller.el, controller);
    }

}

class Controller extends Stream {

    constructor (options = {}) {
        super();

        this._eventListeners = [];
        this._listenChannels = [];

        config.call(this, options);

        if (this.el) this.setElement(this.el);
        this.regions = new Regions(this.regions, this);

        this.initialize.apply(this, arguments);
        this.delegateEvents();
    }

    listen (el, event) {
        let ch = csp.chan(),
            callback = e => csp.putAsync(ch, e);

        el = el instanceof Array ? el : [el];

        for (let i = 0, len = el.length; i < len; i++) {
            el[i].addEventListener(event, callback);
            this._eventListeners.push({el: el[i], event: event, callback: callback});
        }

        this._listenChannels.push(ch);

        return ch;
    }

    initialize () {}

    render () {
        return this;
    }

    // el.parentNode.removeChild(el);

    // Set callbacks, where `this.events` is a Map of
    //
    // *[[callbackFunction, [event selectors]]]*
    //
    //     new Map([
    //         ['edit',      'mousedown .title'],
    //         [this.save,   'click .button'],
    //         [this.log,    ['mousedown .title', 'click .button']],
    //     ])
    //
    // pairs. Callbacks will be bound to the view, with `this` set properly
    // and will be passed the event channels as arguments.
    // Uses event delegation for efficiency.
    // Omitting the selector binds the event to `this.el`.
    delegateEvents (map) {
        map = map || this['events'];

        if (typeof map === 'function') map = map();
        if (!map) return this;

        this.undelegateEvents();

        // TODO: Make this a normal for loop, not for..of
        for (let [method, events] of map.entries()) {
            let channels = [];

            method = typeof method === 'string' ? this[method].bind(this) : method.bind(this);
            events = events instanceof Array ? events : [events];

            for (let [index, event] of events.entries()) {
                let el = this.el,
                    match = event.match(delegateEventSplitter),
                    eventName = match[1],
                    selector = match[2];

                if (selector !== '') {
                    el = el.querySelectorAll(selector);
                }

                channels.push(this.listen(el, eventName));
            }

            method(...channels);
        }

        return this;
    }

    undelegateEvents () {
        for (let i = 0, len = this._eventListeners.length; i < len; i++) {
            let listener = this._eventListeners[i];
            listener.el.removeEventListener(listener.event, listener.callback);
        }
        this._eventListeners = [];

        for (let i = 0, len = this._listenChannels.length; i < len; i++) {
            this._listenChannels[i].close();
        }
        this._listenChannels = [];
    }

    setElement (el) {
        if (typeof el === 'string') {
            this.el = document.querySelector(el);
        } else {
            this.el = document.createElement(this.tag || 'div');
        }

        if (this.classes && this.classes.length > 0) {
            this.el.classList.add(...this.classes);
        }

        return this.el;
    }

    append (controller) {
        return this.regions.self.append(controller);
    }

}

export default Controller;
