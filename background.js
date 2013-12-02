'use strict';
var PROTOCOL = 'http://livereload.com/protocols/official-7';
var RE_URL = /^(?:([a-z]+)\:\/\/)?([a-z-0-9]+(?:\.[a-z-0-9]+)*)/;
function log() {
    console.log.apply(console, arguments);
}
function hasOwn(who, what) {
    return Object.prototype.hasOwnProperty.call(who, what);
}
function inherits(construct, superClass) {
    construct.prototype = Object.create(superClass.prototype);
    construct._super = superClass;
    return construct;
}

function EventEmitter() {
    this._events = {};
}
EventEmitter.prototype._events = null;
EventEmitter.prototype.on = function (eventName, listener) {
    var eventsArr = hasOwn(this._events, eventName)
        ? this._events[eventName]
        : this._events[eventName] = [];
    eventsArr.push(listener);
};
EventEmitter.prototype.off = function (eventName, listener) {
    if(hasOwn(this._events, eventName)) {
        var eventsArr = this._events[eventName];
        eventsArr.splice(eventsArr.indexOf(listener), 1);
    }
};
EventEmitter.prototype.fire = function (eventName) {
    if (hasOwn(this._events, eventName)) {
        var eventsArr = this._events[eventName];
        for (var i = 0; i < eventsArr.length; ++i) {
            eventsArr[i].apply(null, arguments);
        }
    }
};


function Connector(url) {
    Connector._super.call(this);
    this._url = url;
    this.init();
}
inherits(Connector, EventEmitter);
Connector.prototype._url = '';
Connector.prototype._connected = false;
Connector.prototype.init = function() {
    if(this._connected) {
        this.close();
    }
    var ws = this._ws = new WebSocket(this._url);
    var self = this;
    ws.onopen = function () {
        ws.send(JSON.stringify({
            command: 'hello',
            protocols: [PROTOCOL]
        }));
    };
    ws.onclose = function (e) {
        self._connected = false;
        self._ws = null;
        self.fire('disconnect', e);
    };
    ws.onmessage = function(msg) {
        if (!self._connected) {
            self.handleHandshake(msg);
        } else {
            self.handleMessage(msg);
        }
    };
};
Connector.prototype.handleHandshake = function (msg) {
    var msg = this.parseMessage(msg);
    if (msg && msg.command === 'hello' && Object.prototype.toString.call(msg.protocols) === '[object Array]' && msg.protocols.indexOf(PROTOCOL) !== -1) {
        this._connected = true;
        this.fire('connected');
    }
};
Connector.prototype.handleMessage = function (message) {
    var msg = this.parseMessage(message);
    if (msg && msg.command) {
        this.fire(msg.command, msg);
    }
};
Connector.prototype.parseMessage = function (msg) {
    console.log('parsing message:' + msg.data)
    try {
        return JSON.parse(msg.data);
    } catch (ex) { }
};
Connector.prototype.close = function () {
    if (this._ws) {
        this._ws.onclose = null;
        this._ws.close();
        this._ws = null;
        this.fire('close');
    }
};
Connector.prototype.toggle = function () {
    this._connected
    ? this.close()
    : this.init();
};







function TabManager() {
    this._connectors = {};
    //chrome.tab.onActivated.addListener(function (activeInfo) {
    //    var tabId = activeInfo.tabId;
    //    var windowId = activeInfo.windowId;
    //});
}
TabManager.prototype._connectors = null;
TabManager.prototype.toggleCurrent = function () {
    var self = this;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0]) {
            self.toggleTab(tabs[0]);
        }
    });
};
TabManager.prototype.toggleTab = function (tab) {
    var self = this;
    var tabId = tab.id;
    var tabUrl = tab.url;
    var connector = this._connectors[tabId];
    if (connector === undefined) {
        var matches = RE_URL.exec(tabUrl);
        if(matches === null) {
            return;
        }
        var domain = matches[2];
        var port = 35729;
        var path = '/livereload'; // make sure it starts with '/'
        var url = 'ws://' + domain + ':' + port + path;
        log(tabId + ' ' + url);

        connector = self._connectors[tabId] = new Connector(url);
        connector.on('connect', function () {
            log(tabId + ' connect');
            chrome.browserAction.setIcon({ path: "icons/on.png", tabId: tabId });
            chrome.browserAction.setBadgeText({
                "text": "on"
            });
        });
        connector.on('disconnect', function (e) {
            log(tabId + ' close');
            chrome.browserAction.setIcon({ path: "icons/off.png", tabId: tabId });
            chrome.browserAction.setBadgeText({
                "text": "off"
            });
        });
        connector.on('reload', function (message) {
            log(tabId + ' message' + message);
            var reloadProperties = {
                bypassCache: false
            };
            chrome.tabs.reload(tabId, reloadProperties, function () {
                console.log('reloaded');
            });
        });
        chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
            if (hasOwn(self._connectors, tabId)) {
                self._connectors[tabId].close();
                delete self._connectors[tabId];
            }
        });
    }
    connector.toggle();
};


// lazy init
var tabMgr;
chrome.browserAction.onClicked.addListener(function () {
    if (tabMgr === undefined) {
        tabMgr = new TabManager();
    }
    tabMgr.toggleCurrent();
});