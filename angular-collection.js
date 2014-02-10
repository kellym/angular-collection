(function(angular, _){
'use strict';

// Create local references to array methods we'll want to use later.
var array = [];
var push = array.push;
var slice = array.slice;
var splice = array.splice;

angular.module('ngCollection', ['ngResource'])
  .directive('ngCollectionRepeat', ['$parse', '$animate', function($parse, $animate) {
    return {
      transclude: 'element',
      priority: 1000,
      terminal: true,
      $$tlb: true,
      link: function($scope, $element, $attr, ctrl, $transclude){
        var expression = $attr.ngCollectionRepeat;
        var match = expression.match(/^\s*([\s\S]+?)\s+in\s+([\s\S]+?)?\s*$/);
        var modelAlias, collectionName;

        modelAlias = match[1]; // Expose model in child scope as this
        collectionName = match[2]; // Name of the collection in the scope

        // Store elements from previous run so we can destroy them
        var previousElements = [];

        $scope.$watchCollection(collectionName, function ngRepeatAction(collection){
          var previousNode = $element[0];

          // Dump existing DOM nodes
          if (previousElements.length) {
            _.each(previousElements, function(element){
              $animate.leave(element);
            });
            // Clear array
            previousElements = [];
          }

          if (collection) {
            for (var index = 0, length = collection.length; index < length; index++) {
              var model = collection.models[index];
              var childScope = $scope.$new();

              // Add model to the scope
              childScope[modelAlias] = model.model;

              // Add logic helpers to scope
              childScope.$index = index;
              childScope.$first = (index === 0);
              childScope.$last = (index === (collection.length - 1));
              childScope.$middle = !(childScope.$first || childScope.$last);
              // jshint bitwise: false
              childScope.$odd = !(childScope.$even = (index&1) === 0);
              // jshint bitwise: true

              // Build the DOM element
              $transclude(childScope, function(clone) {
                $animate.enter(clone, null, angular.element(previousNode));
                previousNode = clone;
                previousElements.push(clone);
              });
            }
          }
        });
      }
    };
  }])
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
        var save = (this.model.id) ? resource.update({id: this.model.id}, this.model) : resource.save(this.model);
        var that = this;

        // Update exposed promise and resolution indication
        this.$resolved = false;
        this.$promise = save.$promise;

        save.$promise.then(function(model){
          _.extend(that.model, model);

          that.resolved = true;
        });

        return this;
      };

      this.remove = this.del = function(){
        var remove = resource.remove(this.model);
        var that = this;

        // Remove model from collection if it's in one
        if (this.$collection) {
          this.$collection.remove(this);
        }

        // Update exposed promise and resolution indication
        this.$resolved = false;
        this.$promise = remove.$promise;

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
    var Collection = function(url, defaultParams, collection){
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

      var updateLength = function(){
        this.length = this.models.length;
      };

      this.remove = function(model){
        this.models.splice(this.models.indexOf(model), 1);
        updateLength.apply(this);
      };

      // Expose method for querying collection of models
      this.query = function(params){
        params = params || {};
        var that = this;
        var query = resource.query(params);

        this.models = [];

        // Update exposed promise and resolution indication
        this.$resolved = false;
        this.$promise = query.$promise;

        // Update models
        this.$promise.then(function(models){
          // Loop through models
          _.each(models, function(model){
            // Push new model
            that.push(model);
          });

          // Update length property
          updateLength.apply(that);

          that.$resolved = true;
        });

        return this;
      };

      // Get an individual model by id
      this.get = function(id){
        var model = _.find(this.models, function(model){
          return model.model.id == id;
        });

        return model;
      };

      this.push = this.add = function(model){
        if (model && model.model) {
          // Add the model if it doesn't exist
          if (this.indexOf(model) < 0) {
            // Add collection reference
            model.$collection = this;
            // Push it to the models
            this.models.push(model);
          }
        } else if (model) {
          // Instantiate new model
          model = $model(url, model);
          // Add this collection reference to it
          model.$collection = this;
          // Push it to the models
          this.models.push(model);
        }

        // Update length property
        updateLength.apply(this);

        return model;
      };

      // Save all models
      this.save = function(){
        var that = this;
        var defer = $q.defer();
        var counter = 0;

        // Update promise and resolved indicator
        this.$resolved = false;
        this.$promise = defer.promise;

        if (this.length) {
          // Save each model individually
          this.each(function(model){
            model.save().$promise.then(function(){
              // Increment counter
              counter++;

              // If all saves have finished, resolve the promise
              if (counter === that.length) {
                defer.resolve(that.models);
                that.$resolved = true;
              }
            });
          });
        } else {
          // Resolve immediately if there are no models
          defer.resolve();
          this.$resolved = true;
        }

        return this;
      };

      this.find = this.findWhere = function(attrs) {
        return _.find(this.models, function(model){
          for (var key in attrs) {
            if (attrs[key] !== model.model[key]) return false;
          }
          return true;
        });
      };

      this.pluck = function(property){
        var values = [];

        this.each(function(model){
          if (model.model[property]){
            values.push(model.model[property]);
          }
        });

        return values;
      };

      // If a collection has been supplied, let's use that
      if (collection && collection.length) {
        // Loop through models
        _.each(collection, function(model){
          // Push new model
          this.push(model);
        }, this);
      }

      return this;
    };

    // Stolen straight from Backbone
    var methods = ['forEach', 'each', 'first', 'last', 'indexOf'];

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
    return function(url, defaultParams, collection){
      return new Collection(url, defaultParams, collection);
    };
  }]);
})(window.angular, window._);
