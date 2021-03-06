(function(root, factory) {
  if (typeof exports !== 'undefined') {
    // Node.js or CommonJS
    var _ = require('underscore');
    var Backbone = require('backbone');
    var lunr = require('lunr');
    factory(root, exports, _, Backbone, lunr);
  }
  else {
    // Browser globale
    root.Affirmations = factory(root, root.Affirmations || {}, root._, root.Backbone, root.lunr);
  }
}(this, function(root, Affirmations, _, Backbone, lunr) {
  // Models

  var Provider = Affirmations.Provider = Backbone.Model.extend({
    idAttribute: 'id',

    matchesFacets: function(attrs) {
      var attr;
      var val;
      var intersect;
      var thisVal;

      for (attr in attrs) {
        val = attrs[attr];
        thisVal = this.get(attr);

        if (_.isArray(val)) {
          if (!_.isArray(thisVal)) {
            thisVal = [thisVal];
          }
          intersect = _.intersection(val, thisVal);
          if (intersect.length === 0) {
            return false;
          }
        }
        else {
          if (val !== thisVal) {
            return false;
          }
        }
      }

      return true;
    }
  });


  // Collections
  
  var Providers = Affirmations.Providers = Backbone.Collection.extend({
    model: Provider,

    url: '/data/providers.json',

    initialize: function(models, options) {
      this.index = lunr(function() {
        this.field('providername', { boost: 10 });
        this.ref('id');
      });
      this.on('sync', this.updateIndex, this);
      this.on('reset', this.updateIndex, this);
      this.on('sync', this.updateFiltered, this);
      this.on('reset', this.updateFiltered, this);
    },

    updateIndex: function() {
      this.each(function(provider) {
        this.index.add(provider.attributes);
      }, this);
      this.trigger('indexed');
    },

    updateFiltered: function(models) {
      models = models || this.models;
      if (models == this) {
        models = this.models;
      }
      this._filtered = models;
      this._facetOptions = {};
      this.trigger('filter', this._filtered);
    },

    facetOptions: function(attr) {
      this._facetOptions = this._facetOptions || {};

      if (this._facetOptions[attr]) {
        return this._facetOptions[attr];
      }
      else {
        this._facetOptions[attr] = []; 
      }

      var opts = this._facetOptions[attr];
      var seen = {};
      var providers = this._filtered || this.models;
      _.each(providers, function(provider) {
        var val = provider.get(attr);
        var vals;

        if (val === '') {
          return;
        }

        if (_.isArray(val)) {
          vals = val;
        }
        else {
          vals = [val];
        }

        _.each(vals, function(val) {
          if (!seen[val]) {
            seen[val] = true;
            opts.push(val);
          }
        });
      }, this);

      return opts;
    },

    facet: function(attrs) {
      this.updateFiltered(this.filter(function(provider) {
        return provider.matchesFacets(attrs);
      }, this));
      this.trigger('facet', this._filtered, attrs);
      return this._filtered;
    },

    resetFilters: function() {
      this.updateFiltered();
      this.trigger('resetfilters');
    },

    search: function(value) {
      this.updateFiltered(_.map(this.index.search(value), function(match) {
        return this.get(match.ref);
      }, this));
      this.trigger('search', this._filtered);
      return this._filtered; 
    }
  });


  // Views
  
  var FiltersView = Affirmations.FiltersView = Backbone.View.extend({
    tagName: 'form',

    options: {
      filters: [
        {
          attribute: 'type',
          label: "Provider type",
          type: 'select'
        },
        {
          attribute: 'specialties',
          label: "Other specialties and sensitivities",
          type: 'select'
        },
        {
          attribute: 'county',
          label: "County",
          type: 'select'
        },
        {
          attribute: 'orientation',
          label: "Sexual/attractional orientation of provider",
          type: 'select'
        },
        {
          attribute: 'sexgenderidentity',
          label: "Sex/gender identity of provider",
          type: 'select'
        },
        {
          attribute: 'race',
          label: "Race/ethnicity identity of provider",
          type: 'select'
        },
        {
          attribute: 'languages',
          label: "Languages spoken",
          type: 'select'
        },
        {
          attribute: 'nearbus',
          label: "Near a bus line",
          type: 'checkbox'
        },
        {
          attribute: 'completedculturalcompetencytraining',
          label: "Has completed Affirmations' cultural competency training(s) for health providers",
          type: 'checkbox'
        },
        {
          attribute: 'lowincome',
          label: "Offers low-income accomodations",
          type: 'checkbox'
        }
      ],
      resetButtonLabel: "Clear filters"
    },

    attributes: {
      id: 'filters'
    },

    events: {
      'reset': 'reset' 
    },

    initialize: function(options) {
      this._filters = {};
      this._childViews = [];
      _.each(this.options.filters, function(filterOpts) {
        var view = this._createChildView(filterOpts);
        this.listenTo(view, 'change', this.handleChange, this);
        this._childViews.push(view);
      }, this);

      this.summaryView = new FilterSummaryView({
        collection: this.collection
      });

      this.submitButtonView = new ProviderCountView({
        collection: this.collection
      });
      this.submitButtonView.on('click', function() {
        this.trigger('showproviders');
      }, this);

      this.collection.on('sync', this.render, this);
    },

    _createChildView: function(options) {
      var opts = {
        filterAttribute: options.attribute,
        label: options.label,
        placeholder: options.placeholder,
        collection: this.collection
      };

      if (options.type === 'checkbox') {
        return new CheckboxFilterView(opts);
      }
      else {
        return new SelectFilterView(opts);
      }
    },

    render: function() {
      this.$el.append(this.summaryView.render().$el);
      this.$el.append(this.submitButtonView.render().$el);
      $('<button>')
        .attr('type', 'reset')
        .addClass('btn btn-default')
        .html(this.options.resetButtonLabel)
        .appendTo(this.$el);
      _.each(this._childViews, function(view) {
        this.$el.append(view.render().$el);
      }, this);
      return this;
    },

    handleChange: function(attr, val) {
      if (!val) {
        delete this._filters[attr];
      }
      else {
        this._filters[attr] = val;
      }
      this.collection.facet(this._filters);
    },

    reset: function(evt) {
      evt.preventDefault();
      this._filters = {};
      this.collection.resetFilters();
    }
  });

  var FilterView = Backbone.View.extend({
    initialize: function(options) {
      this.filterAttribute = options.filterAttribute;
      this.label = options.label;
      this.postInitialize();
    },

    postInitialize: function() {}
  });
  
  var SelectFilterView = FilterView.extend({
    attributes: {
      class: 'form-group'
    },

    events: {
      'change select': 'change'
    },

    postInitialize: function() {
      this.collection.on('filter', this.updateOptions, this);
      this.collection.on('resetfilters', this.deselectAll, this);
    },

    render: function() {
      var $select;
      $('<label>').attr('for', this.filterAttribute).html(this.label)
        .appendTo(this.$el);
      $select = $('<select>').attr('id', this.filterAttribute)
        .attr('multiple', 'multiple')
        .addClass('form-control')
        .appendTo(this.$el);
      _.each(this.collection.facetOptions(this.filterAttribute), function(opt) {
        $('<option>').attr('value', opt).html(opt)
          .appendTo($select);
      }, this);
      this._sizeSelect($select, this.$('option').length);
      return this;
    },

    /**
     * Update the HTML select element to reflect the currently available
     * options.
     */
    updateOptions: function() {
      var $select = this.$('select');
      var $options = this.$('option');
      // If the select has a value, save it to reselect the selected values
      var selectedVals = $select.val() || [];
      var facetOptions = this.collection.facetOptions(this.filterAttribute);

      $options.prop('selected', false);
      $options.prop('disabled', true);
      _.each(facetOptions, function(val) {
        $options.filter('[value="' + val + '"]').prop('disabled', false);
      }, this);
      _.each(selectedVals, function(val) {
        $options.filter('option[value="' + val + '"]').prop('selected', true);
      }, this);

      this._toggleDisabled($select, facetOptions.length);

      return this;
    },

    /**
     * If a filter select has no available options, disable it.
     */
    _toggleDisabled: function($select, numOptions) {
      if (numOptions === 0) {
        $select.attr('disabled', 'disabled');
        this.$('label').addClass('disabled');
      }
      else {
        $select.removeAttr('disabled');
        this.$('label').removeClass('disabled');
      }
    },

    /**
     * Set a select element's size attribute based on the number of options.
     */
    _sizeSelect: function($select, numOptions) {
      if (numOptions === 0) {
        $select.removeAttr('size');
      }
      else {
        $select.attr('size', numOptions); 
      }
    },

    change: function(evt) {
      var val = this.$('select').val();
      this.trigger('change', this.filterAttribute, val);
    },

    deselectAll: function() {
      this.$('option').prop('selected', false);
    }
  });

  var CheckboxFilterView = FilterView.extend({
    attributes: {
      class: 'checkbox'
    },

    events: {
      'change input': 'change'
    },
    
    postInitialize: function() {
       this.collection.on('resetfilters', this.reset, this);
    },

    render: function() {
      var $label = $('<label>');
      $label.html(this.label);
      $('<input type="checkbox">').attr('value', this.filterAttribute)
        .attr('id', this.filterAttribute)
        .prependTo($label);
      this.$el.append($label);
      return this;
    },

    change: function(evt) {
      var val = this.$('input').prop('checked');
      this.trigger('change', this.filterAttribute, val); 
    },

    reset: function() {
      this.$('input').prop('checked', false);
    }
  });

  var ProviderListView = Affirmations.ProviderListView = Backbone.View.extend({
    events: {
      'click .provider-attrs a': 'handleClickLink'
    },

    initialize: function(options) {
      this.collection.on('filter', this.handleFilter, this);
    },

    handleFilter: function(providers) {
      var map = {};
      _.each(providers, function(provider) {
        map[provider.id] = true;
      });
      this.$providers().each(function() {
        var $el = $(this);
        var id = $el.data('id');
        $el.toggle(map[id] || false);
      });
    },

    $providers: function() {
      return this.$('.provider');
    },

    /**
     * Show the summary display of the provider entries rather than the full view.
     */
    showList: function() {
      this.$el.removeClass('detail');
      this.$el.addClass('summary'); 
      this.$('.provider').removeClass('detail');
      return this;
    },

    showDetail: function(id) {
      this.$el.removeClass('summary');
      this.$el.addClass('detail');
      this.$('#provider-' + id).addClass('detail');
      return this;
    },

    handleClickLink: function(evt) {
      evt.preventDefault();
      var url = $(evt.target).attr('href');
      window.open(url);
    }
  });

  var ProviderCountView = Affirmations.ProviderCountView = Backbone.View.extend({
    tagName: 'button',

    attributes: {
      class: 'btn btn-primary',
      id: 'count'
    },

    events: {
      'click': 'click'
    },

    initialize: function(options) {
      this.collection.on('filter', this.updateFilteredLength, this);
      this.collection.once('sync', this.updateLength, this);
      this.length = this.collection.length;
    },

    render: function() {
      var label = this.length === 1 ? 'Provider' : 'Providers';
      this.$el.html('View ' + this.length + ' ' + label + ' &#0187;');
      return this;
    },

    updateFilteredLength: function(providers) {
      this.length = providers.length;
      this.render();
    },

    updateLength: function() {
      this.length = this.collection.length;
      this.render();
    },

    click: function(evt) {
      evt.preventDefault();
      this.trigger('click');
    }
  });

  var FilterSummaryView = Backbone.View.extend({
    attributes: {
      class: "filter-summary"
    },

    options: {
      label: "Filters selected",
      noneLabel: "None",
      checkboxLabels: {
        'nearbus': "Near a bus line",
        'completedculturalcompetencytraining': "Completed Affirmations traning",
        'lowincome': "Offers low-income accomodations"
      }
    },
  
    initialize: function(options) {
      _.extend(this.options, options);
      this._filters = {};
      this.collection.on("facet", this.handleFacet, this);
      this.collection.on("resetfilters", this.handleResetFilters, this);
      this.renderInitial();
    },

    renderInitial: function() {
      $("<span>" + this.options.label + "</span>")
        .addClass('label')
        .appendTo(this.$el);
      this.$list = $('<ul>').appendTo(this.$el);
      this.$noneLabel = $("<span>" + this.options.noneLabel + "</span>")
        .hide()
        .appendTo(this.$el);
      return this.render();
    },

    render: function() {
      var empty = _.isEmpty(this._filters);
      this.$list.empty();
      _.each(this._filters, function(selected, filter) {
        if (_.isArray(selected)) {
          _.each(selected, function(val) {
            this.addFilterItem(filter, val);
          }, this);
        }
        else {
          this.addFilterItem(filter, this.options.checkboxLabels[filter]);
        }
      }, this);
      this.$noneLabel.toggle(empty);
      this.$list.toggle(!empty);
      return this;
    },

    addFilterItem: function(filter, label) {
      $("<li>" + label + "</li>")
        .addClass(filter)
        .appendTo(this.$list);
    },

    /**
     * Handles the facet collection event.
     */
    handleFacet: function(filtered, attrs) {
      this._filters = attrs;
      this.render();
    },

    handleResetFilters: function() {
      this._filters = {};
      this.render();
    }
  });

  var SearchView = Affirmations.SearchView = Backbone.View.extend({
    options: {
      placeholder: "Search by name"
    },

    tagName: 'form',

    attributes: {
      class: 'navbar-form navbar-left',
      id: 'search-form'
    },

    events: {
      'submit': 'submit'
    },

    render: function() {
      var $container = $('<div>').addClass('input-group');
      var $icon = $('<span>').addClass('glyphicon glyphicon-search');
      var $btn = $('<button>').attr('type', 'submit')
        .addClass('btn btn-default')
        .attr('title', "Search")
        .append($icon);
      $('<input>').attr('type', 'search').addClass('form-control')
        .attr('id', 'search')
        .attr('placeholder',  this.options.placeholder)
        .appendTo($container);
      $('<span>').addClass('input-group-btn')
        .append($btn)
        .appendTo($container);
      this.$el.append($container);
      this.delegateEvents();
      return this;
    },

    submit: function(evt) {
      evt.preventDefault();
      var val = this.$('input').val();
      this.collection.resetFilters();
      if (val.length) {
        this.collection.search(val);
      }
      this.trigger('search');
    }
  });

  var Router = Affirmations.Router = Backbone.Router.extend({
    routes: {
      '': 'index',
      'providers': 'providers',
      'providers/:id': 'providerDetail'
    }
  });

  return Affirmations;
}));
