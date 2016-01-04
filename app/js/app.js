/**
 * Created by ld on 8/5/15.
 */

var $ = require('jquery');
var _ = require('underscore');
var Backbone = require('backbone');
Backbone.$ = window.$ = window.jQuery = $;
var Marionette = require('backbone.marionette');
var T = require("timbre/timbre.dev");
var Highcharts = require('highcharts-browserify');

Highcharts.setOptions({
    global: {
        useUTC: false
    }
});

require('bootstrap');

var io = require('socket.io-client')(window.location.origin);

var ControllerModel = Backbone.Model.extend({
    defaults: {
        value: null
    },

    initialize: function () {
        io.on('controller', function (data) {
            this.set(data)
        }.bind(this))
    }
});

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

var UsersModel = Backbone.Model.extend({
    defaults: {
        value: '???'
    },

    initialize: function () {
        io.on('users', function (data) {
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
            this.set(data)
        }.bind(this))
    }
});

var TachModel = Backbone.Model.extend({
    defaults: {
        rpm: '???'
    },

    initialize: function () {

        var glide = T("param");
        var vco = T("square", {
            freq: glide,
            mul: 0.21
        }).play();

        T("interval", {interval: 500}, function (count) {
            var f = parseInt(this.get('rpm')) * .06;
            if (f) {
                glide.sinTo(f, "400ms");
            }
        }.bind(this)).start();

        io.on('rpm', function (data) {
            this.set(data);
            this.trigger('update', data);
        }.bind(this))
    }
});

var controller = new ControllerModel();
var servo = new ServoModel();
var camera = new CameraModel();
var users = new UsersModel();
var tach = new TachModel();
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
        'change': 'updateFrame'
    },

    width: null,
    height: null,

    updateWidthAndHeight: function () {
        var rect = this.$el.find('canvas')[0].getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
    },

    onWindowResize: function () {
        this.updateWidthAndHeight();
        this.canvas.width = this.context.width = this.image.width = this.width;
        this.canvas.height = this.context.height = this.image.height = this.height;
    },


    initialize: function () {
        this.onWindowResize = this.onWindowResize.bind(this);
    },

    onShow: function () {
        this.canvas = this.$el.find('canvas')[0];
        this.context = this.canvas.getContext('2d');
        this.image = new Image();
        this.onWindowResize();
        this.image.onload = function () {
            this.context.drawImage(this.image, 0, 0, this.width, this.height);
        }.bind(this)
    },

    updateFrame: function () {
        try {
            this.image.src = "data:image/jpeg;base64," + this.model.get('frame');
        } catch (e) {
        }
    }
});


var SliderView = Marionette.ItemView.extend({
    template: require('../tmpl/slider.hbs'),

    min: 0,
    max: 100,
    step: 1,

    templateHelpers: function () {
        return {
            title: this.getOption('title'),
            disabled: this.getOption('disabled'),
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
        if (!this.getOption('disabled')) {
            this.value = parseInt(this.$el.find('input').val());
            this.$el.find('small').text(this.value)
        }
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


var HighChart = Marionette.ItemView.extend({
    className: 'controller-chart',

    getOptionAndResult: function (thing) {
        var realThing = this.getOption(thing);
        return _.isFunction(realThing) ? realThing.call(this) : realThing;
    },

    template: false,

    title: undefined,

    yAxisTitle: undefined,

    seriesName: undefined,

    onShow: function (options) {
        var self = this;

        this.chartInstance = null;

        this.$el.highcharts({
            chart: {
                type: 'line',
                animation: Highcharts.svg, // don't animate in old IE
                marginRight: 10,
                events: {
                    load: function () {
                        self.chartInstance = this;
                        self.getOptionAndResult.call(self, 'onLoad');
                        self.$el.find('text[text-anchor="end"]:contains(Highcharts)').hide();
                    }
                }
            },
            title: {
                text: this.getOptionAndResult('title')
            },
            xAxis: {
                type: 'datetime',
                tickPixelInterval: 150
            },
            yAxis: {
                title: {
                    text: this.getOptionAndResult('yAxisTitle')
                },
                plotLines: [{
                    value: 0,
                    width: 1,
                    color: '#808080'
                }]
            },
            tooltip: false,
            //tooltip: {
            //    formatter: function () {
            //        return '<b>' + this.series.name + '</b><br/>' +
            //            Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', this.x) + '<br/>' +
            //            Highcharts.numberFormat(this.y, 2);
            //    }
            //},
            legend: {
                enabled: true
            },
            exporting: {
                enabled: false
            },
            series: this.getOptionAndResult('series')
        });
    }
});

var Pages = {

    home: function (viewPort) {

        var HomePage = RowView.extend({
            childViews: [

                Marionette.ItemView.extend({
                    template: require('../tmpl/greetings.hbs')
                }),

                CameraView.extend({
                    model: camera
                }),

                SliderView.extend({

                    title: 'Slide to set RPM',

                    min: 500,
                    max: 1000,

                    onUIChange: function () {
                        SliderView.prototype.onUIChange.apply(this, arguments);
                        var data = {
                            value: this.value
                        }
                        io.emit('controller', data)
                        controller.set(data)
                    },

                    setValue: function () {
                        SliderView.prototype.setValue.call(this, this.model.get('value'))
                    },

                    model: controller,

                    modelEvents: {
                        'change': 'setValue'
                    },

                    onShow: function () {
                        this.setValue()
                    }
                }),

                SliderView.extend({

                    title: 'Servo Position (view only)',

                    min: 0,
                    max: 180,
                    disabled: true,

                    setValue: function () {
                        SliderView.prototype.setValue.call(this, this.model.get('value'))
                    },

                    model: servo,

                    modelEvents: {
                        'change': 'setValue'
                    },

                    onShow: function () {
                        this.setValue()
                    }
                }),

                HighChart.extend({
                    title: 'Tachometer',
                    yAxisTitle: 'RPM',

                    onLoad: function () {
                        var chart = this.chartInstance;
                        var _update = function () {
                            var x = (new Date()).getTime();
                            chart.series[0].addPoint([x, tach.get('rpm')]);
                            chart.series[1].addPoint([x, controller.get('value')]);
                        }
                        tach.on('update', _update)
                    },

                    series: [
                        {name: 'Sensed RPM'},
                        {name: 'Commanded RPM'}
                    ]
                }),

                HighChart.extend({
                    title: 'Controller Output',
                    yAxisTitle: 'Angle (deg)',

                    onLoad: function () {
                        var chart = this.chartInstance;
                        var _update = function () {
                            var x = (new Date()).getTime();
                            chart.series[0].addPoint([x, servo.get('value')]);
                        }
                        tach.on('update', _update)
                    },

                    series: [{name: 'Servo Position'}]
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
            users: users.get('value'),
            rpm: parseInt(tach.get('rpm')),
            productName: 'luke\'s enginelab'
        };
    },

    onShow: function () {
        setInterval(this.render.bind(this), 500)
    }
})

var app = new Marionette.Application();
window.app = app;

app.addRegions({
    nav: '#nav',
    content: '#content'
});

// set up nav
var nav = new NavView({
    model: tach
});
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
