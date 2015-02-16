Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    default_entries: [],
    items: [
        {xtype:'container',itemId:'selector_box'},
        {xtype:'container',itemId:'message_box',tpl:'Time Entries for <tpl>{_refObjectName}</tpl>'},
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this.down('#message_box').update(this.getContext().getUser());
        this._getSavedDefaults().then({
            scope: this,
            success: function(default_entries) {
                if ( default_entries.length == 0 ) {
                    this.down('#display_box').add({
                        xtype:'container',
                        html: 'There are no configured default time entries for ' + this.getContext().getProject()._refObjectName
                    });
                } else {
                    this.default_entries = default_entries;
                    this._updateGrid(default_entries);
                }
            },
            failure: function(msg) {
                alert(msg);
            }
        });
    },
    _addRecordsToDefaultList: function(records){
        var new_refs = [];
        Ext.Array.each(records,function(record){
            new_refs.push(record.get('_ref'))
        });

        this.default_entries = Ext.Array.merge(this.default_entries,new_refs);

        this._saveConfiguration(this.default_entries);
        this._updateGrid(this.default_entries);
    },
    _updateGrid: function(references) {
        var promises = [];
        var container = this.down('#display_box');
        
        container.removeAll();
        
        Ext.Array.each(references, function(reference){
            promises.push(this._getRecordFromReference(reference));
        },this);
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(records){
                var rows = Ext.Array.flatten(records);
                this.logger.log(rows);
                var store = Ext.create('Rally.data.custom.Store', {
                    data: rows
                });
                
                var grid = Ext.create('Rally.ui.grid.Grid', {
                    store: store,
                    columnCfgs: [
                        {dataIndex:'FormattedID',text:'id'},
                        {dataIndex:'Name',text:'Name', flex: 1},
                        {dataIndex:'Project',text:'Team', renderer: function(value){ 
                            if (value && value._refObjectName) {
                                return value._refObjectName
                            }
                            return value;
                        }}
                    ]
                });
                
                container.add(grid);
            },
            failure: function(msg){
                alert("Cannot load grid: ", msg);
            }
        });
    },
    _getRecordFromReference: function(reference){
        var deferred = Ext.create('Deft.Deferred');
        var ref_array = reference.split(/\//);
        if ( ref_array.length < 2 ) {
            deferred.reject("Reference must have model and object id");
        } else {
            var oid = ref_array.pop();
            var model = ref_array.pop();
            
            Ext.create('Rally.data.wsapi.Store', {
                model: model,
                fetch: ['Name','FormattedID','ScheduleState','Project'],
                filters: [{ property:'ObjectID', value: oid}],
                autoLoad: true,
                context: {
                    project: null
                },
                listeners: {
                    load: function(store, records, successful) {
                        if (successful){
                            deferred.resolve(records);
                        } else {
                            deferred.reject('Failed to load store for model [' + model + ']' );
                        }
                    }
                }
            });
        }
        return deferred.promise;
    },
    _getSavedDefaults: function() {
        var deferred = Ext.create('Deft.Deferred');
        var project_ref = this.getContext().getProject()._ref;

        Rally.data.PreferenceManager.load({
            project: project_ref,
            success: function(prefs) {
                console.log("returned:",prefs);
                var records = [];
                if (prefs && prefs['rally.technicalservices.defaulttimeentries'] ) {
                    if( typeof prefs['rally.technicalservices.defaulttimeentries'] == 'string') {
                        records = Ext.JSON.decode(prefs['rally.technicalservices.defaulttimeentries']);
                    }
                }
                deferred.resolve(records);
            }
        });
        return deferred.promise;
    }
});
