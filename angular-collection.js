(function(angular, _){
'use strict';

// Create local references to array methods we'll want to use later.
var array = [];
var push = array.push;
var slice = array.slice;
var splice = array.splice;

angular.module('ngCollection', ['ngResource'])
  .factory('$model', ['$resource', '$q', function($resource, $q){
    var Model = function(url, model){
      // Remove leading slash if provided
      url = (url[0] == '/') ? url.slice(1) : url;

      // Instantiate resource
      var defaultParams = (model && model.id) ? {id: model.id} : {};

      var resource = $resource('/' + url + '/:id', defaultParams, {
        // Add PUT method since it's not available by default
        update: {
          method: 'PUT'
        }
      });

      // Store the model
      this.model = model || {};

      // Expose resource promise and resolved
      this.$resolved = true;
      this.$promise = null;

      this.get = function(id){
        id = id || this.model.id;
        var get = resource.get({id: id});
        var that = this;

        // Update exposed promise and resolution indication
        this.$resolved = false;
        this.$promise = get.$promise;

        get.$promise.then(function(model){
          // Update model data
          _.extend(that.model, model);

          // Update resolution indicator
          that.$resolved = true;
        });

        return this;
      };

      this.save = function(){
        var save = (this.model.id) ? resource.update(this.model) : resource.save(this.model);
        var that = this;

        // Update exposed promise and resolution indication
        this.$resolved = false;
        this.$promise = save.$promise;

        save.$promise.then(function(model){
          _.extend(this.model, model);
          that.resolved = true;
        });

        return this;
      };

      this.remove = this.del = function(){
        var remove = resource.remove(this.model);
        var that = this;

        // Update exposed promise and resolution indication
        this.$resolved = false;
        this.$promise = save.$promise;

        remove.$promise.then(function(model){
          that.resolved = true;
        });

        return this;
      };
    };

    // Return the constructor
    return function(url, model){
      return new Model(url, model);
    };
  }])
  .factory('$collection', ['$resource', '$q', '$model', function($resource, $q, $model){
    // Collection constructor
    var Collection = function(url, defaultParams){
      // Remove leading slash if provided
      url = (url[0] == '/') ? url.slice(1) : url;

      // Instantiate resource
      var resource = $resource('/' + url + '/:id', defaultParams, {
        // Add PUT method since it's not available by default
        update: {
          method: 'PUT'
        }
      });

      // Store models for manipulation and display
      this.models = [];

      // Store length so we can look it up faster/more easily
      this.length = 0;

      // Expose resource promise and resolved
      this.$resolved = true;
      this.$promise = null;

      // Expose method for querying collection of models
      this.query = function(params){
        params = params || {};
        var that = this;
        var query = resource.query(params);

        // Update exposed promise and resolution indication
        this.$resolved = false;
        this.$promise = query.$promise;

        // Update models
        this.$promise.then(function(models){
          // Loop through models
          _.each(models, function(model){
            var existingModel = _.find(that.models, {id: model.id});

            if (existingModel) {
              // Update existing model
              _.extend(existingModel, model);
            } else {
              // or push new model
              that.models.push($model('url', model));
            }
          });

          that.length = that.models.length;

          that.$resolved = true;
        });

        return this;
      };

      // Get an individual model by id
      this.get = function(id){
        var model = _.find(this.models, {id: id});

        return model;
      };

      this.push = this.add = function(model){
        if (model && model.model) {
          this.models.push(model);
        } else if (model) {
          this.models.push($model(model));
        }

        return this;
      };

      // Save all models
      this.save = function(){
        var that = this;
        var defer = $q.defer();
        var counter = 0;

        // Update promise and resolved indicator
        this.$resolved = false;
        this.$promise = defer.promise;

        // Save each model individually
        _.each(this.models, function(model){
          model.save().$promise.then(function(){
            // Increment counter
            counter++;

            // If all saves have finished, resolve the promise
            if (counter === that.length) {
              that.$resolved = true;
              defer.resolve(that.models);
            }
          });
        });

        return this;
      };

      return this;
    };

    // Stolen straight from Backbone
    // NOTE - The current included methods have been selected arbitrarily based on
    // what I've actually used in my application
    var methods = ['forEach', 'each', 'map', 'find', 'pluck', 'last'];

    _.each(methods, function(method) {
      Collection.prototype[method] = function() {
        // Slice returns arguments as an array
        var args = slice.call(arguments);
        // Add the models as the first value in args
        args.unshift(this.models);
        // Return the _ method with appropriate context and arguments
        return _[method].apply(_, args);
      };
    });

    // Return the constructor
    return function(url, defaultParams){
      return new Collection(url, defaultParams);
    };
  }]);
})(window.angular, window._);
