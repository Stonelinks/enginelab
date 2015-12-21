/**
 * Created by ld on 8/5/15.
 */

var $ = require('jquery');
var _ = require('underscore');
var Backbone = require('backbone');
Backbone.$ = window.$ = window.jQuery = $;
var Marionette = require('backbone.marionette');
require('bootstrap');

var io = require('socket.io-client')(window.location.origin);

var ServoModel = Backbone.Model.extend({
    defaults: {
        value: null
    },

    initialize: function () {
        io.on('servo', function (data) {
            this.set(data)
        }.bind(this))
    }
});

var CameraModel = Backbone.Model.extend({
    defaults: {
        frame: null
    },

    initialize: function () {
        io.on('frame', function (data) {
            console.log('frame')
            this.set(data)
        }.bind(this))
    }
});

var servo = new ServoModel();
var camera= new CameraModel();
io.emit('sync');

var RowView = Marionette.LayoutView.extend({
    template: require('../tmpl/row.hbs'),

    childViews: [],

    initialize: function () {
        this.childViews.forEach(function (View, index) {
            this.addRegion('row' + index, '.row:nth-of-type(' + (index + 1) + ')');
        }.bind(this));
    },

    templateHelpers: function () {
        return {
            childViews: this.childViews
        };
    },

    onShow: function () {
        this.childViews.forEach(function (View, index) {
            this.getRegion('row' + index).show(new View(this.options));
        }.bind(this));
    }
});


var CameraView = Marionette.ItemView.extend({
    template: require('../tmpl/camera.hbs'),

    modelEvents: {
        'change': 'render'
    },

    onRender: function() {
        this.$el.find('img').attr('src', 'data:image/jpg;base64,' + this.model.get('frame'));
    }
});


var SliderView = Marionette.ItemView.extend({
    template: require('../tmpl/slider.hbs'),

    min: 0,
    max: 180,
    step: 1,

    templateHelpers: function () {
        return {
            min: this.getOption('min'),
            max: this.getOption('max'),
            step: this.getOption('step')
        };
    },

    events: {
        'change input': 'onUIChange',
        'mousedown input': 'startPolling',
        'mouseup input': 'stopPolling',
        'touchstart input': 'startPolling',
        'touchend input': 'stopPolling'
    },

    value: null,
    onUIChange: function () {
        this.value = parseInt(this.$el.find('input').val());
        this.$el.find('small').text(this.value)
    },

    setValue: function (value) {
        this.value = parseInt(value);
        this.$el.find('input').val(this.value);
        this.$el.find('small').text(this.value)
    },

    _pollingInterval: null,
    startPolling: function () {
        this._pollingInterval = setInterval(this.onUIChange.bind(this), 100)
    },

    stopPolling: function () {
        clearInterval(this._pollingInterval)
    },

    onShow: function () {
        this.onUIChange()
    },

    onDestroy: function () {
        this.stopPolling()
    }
});

var Pages = {

    home: function (viewPort) {

        var HomePage = RowView.extend({
            childViews: [
                SliderView.extend({
                    onUIChange: function () {
                        SliderView.prototype.onUIChange.apply(this, arguments);
                        console.log(this.value);
                        io.emit('servo', {
                            value: this.value
                        })
                    },

                    setValue: function () {
                        SliderView.prototype.setValue.call(this, this.model.get('value'))
                    },

                    model: servo,

                    modelEvents: {
                        'change': 'setValue'
                    },

                    onShow: function () {
                        this.setValue()
                    },
                }),
                CameraView.extend({
                    model: camera
                })
            ]
        });

        viewPort.show(new HomePage());
    }
};

var NavView = Marionette.ItemView.extend({
    template: require('../tmpl/nav.hbs'),

    templateHelpers: function () {
        return {
            productName: 'Luke\'s Engine Lab'
        };
    },

    onRender: function () {
        var activeClass = 'btn-primary';
        var inactiveClass = 'btn-default';
        var navButtons = '.navbar-nav a';

        this.$el.find(navButtons).removeClass(activeClass);
        var activeButton;
        if (!window.location.hash.length) {
            activeButton = navButtons + '[href="#home"]';
        } else {
            activeButton = navButtons + '[href="' + window.location.hash + '"]';
        }
        this.$el.find(activeButton).addClass(activeClass);
        this.$el.find(navButtons).not(activeButton).addClass(inactiveClass);
    }
});

var app = new Marionette.Application();
window.app = app;

app.addRegions({
    nav: '#nav',
    content: '#content'
});

// set up nav
var nav = new NavView();
app.addInitializer(function () {
    app.getRegion('nav').show(nav);
});

// main pages
var showView = function (viewWrapperFunc) {
    return function () {
        var viewPort = app.getRegion('content');
        viewWrapperFunc(viewPort);
    }
};

var pages = {
    home: showView(Pages.home)
};
pages['*catchall'] = pages.home;

var Router = Marionette.AppRouter.extend({
    routes: pages
});

// start the router
app.addInitializer(function (opts) {
    this.router = new Router();
    this.router.on('route', function () {
        nav.render();
    });
    Backbone.history.start({
        // pushState: true
    });
});

app.start();
