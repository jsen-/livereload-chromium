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
}
inherits(Connector, EventEmitter);
Connector.prototype._url = '';
Connector.prototype._connected = false;
Connector.prototype.connect = function() {
    if(this._ws) {
        this.disconnect();
    }
    var ws = this._ws = new WebSocket(this._url);

    ws.onopen = function () {
        log('onopen');
        ws.send(JSON.stringify({
            command: 'hello',
            protocols: [PROTOCOL]
        }));
    };

    ws.onclose = function (e) {
        log('onclose ', e);
        this.disconnect(e);
    }.bind(this);

    ws.onmessage = function(msg) {
        log('onmessage ', msg)
        if (!this._connected) {
            this.handleHandshake(msg);
        } else {
            this.handleMessage(msg);
        }
    }.bind(this);

    ws.onerror = function(err) {
      log('onerror ', err);
    };
};
Connector.prototype.handleHandshake = function (msg) {
    var msg = this.parseMessage(msg);
    if (msg && msg.command === 'hello' && Object.prototype.toString.call(msg.protocols) === '[object Array]' && msg.protocols.indexOf(PROTOCOL) !== -1) {
        this._connected = true;
        this.fire('connect');
    }
};
Connector.prototype.handleMessage = function (message) {
    var msg = this.parseMessage(message);
    if (msg && msg.command) {
        this.fire(msg.command, msg);
    }
};
Connector.prototype.parseMessage = function (msg) {
    log('parsing message:', msg.data);
    try {
        return JSON.parse(msg.data);
    } catch (ex) { }
};
Connector.prototype.disconnect = function (e) {
    this._connected = false;
    var ws = this._ws;
    if (ws) {
        ws.close();
        ws.onopen = ws.onclose = ws.onmessage = ws.onerror = null;
        this._ws = null;
        this.fire('disconnect', e);
    }
};
Connector.prototype.toggle = function () {
    this._ws
    ? this.disconnect()
    : this.connect();
};
Connector.prototype.isConnected = function() {
    return this._connected;
};






function setConnected(tabId, url) {
    chrome.browserAction.setIcon({ path: "icons/on.png", tabId: tabId });
    chrome.browserAction.setTitle({ title: "Connected to " + url, tabId: tabId});
}

function TabManager() {
    this._connectors = {};
    chrome.tabs.onRemoved.addListener(this.removeTab.bind(this));
    chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
        if(changeInfo.status === 'complete') {
            var connector = this._connectors[tabId];
            if(connector && connector.isConnected()) {
                setConnected(tabId);
            }
        }
    }.bind(this));
}
TabManager.prototype._connectors = null;

TabManager.prototype.toggleTab = function (tab) {
    var tabId = tab.id;
    (this._connectors[tabId] || (this._connectors[tabId] = this.createConnector(tab))).toggle();
};

TabManager.prototype.createConnector = function(tab) {
    var tabId = tab.id;
    var tabUrl = tab.url;
    var matches = RE_URL.exec(tabUrl);
    if(matches === null) {
        return;
    }
    var domain = matches[2];
    var port = 35729;
    var path = '/livereload'; // make sure it starts with '/'
    var url = 'ws://' + domain + ':' + port + path;
    chrome.browserAction.setIcon({ path: "icons/connecting.png", tabId: tabId });
    chrome.browserAction.setTitle({ title: "Connecting...", tabId: tabId});
    var connector = new Connector(url);
    connector.on('connect', function () {
        log(tabId + ' connect');
        setConnected(tabId, url);
    });
    connector.on('disconnect', function (e) {
        log(tabId + ' disconnect');
        chrome.browserAction.setIcon({ path: "icons/off.png", tabId: tabId });
        chrome.browserAction.setTitle({ title: "Disconnected from " + url, tabId: tabId});
        this.removeTab(tabId);
    }.bind(this));
    connector.on('reload', function (message) {
        log(tabId + ' message' + message);
        var reloadProperties = {
            bypassCache: false
        };
        chrome.tabs.reload(tabId, reloadProperties, function () {
            console.log('reloaded');
        });
    });
    return connector;
};
TabManager.prototype.removeTab = function(tabId) {
    if (hasOwn(this._connectors, tabId)) {
        this._connectors[tabId].disconnect();
        delete this._connectors[tabId];
    }
};



// lazy init
var tabMgr;
chrome.browserAction.onClicked.addListener(function (tab) {
    if (tabMgr === undefined) {
        tabMgr = new TabManager();
    }
    tabMgr.toggleTab(tab);
});
