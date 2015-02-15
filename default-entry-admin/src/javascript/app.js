Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    default_entries: [],
    items: [
        {xtype:'container',itemId:'selector_box'},
        {xtype:'container',itemId:'message_box',tpl:'Default Time Entries for <tpl>{_refObjectName}</tpl>'},
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        console.log(this.getContext().getProject());
        this.down('#message_box').update(this.getContext().getProject());
        this._addButton(this.down('#selector_box'));
    },
    _addButton: function(container){
        container.add({
            xtype:'rallybutton',
            text: 'Choose',
            cls: 'secondary', // blue outline, white interior
            listeners: {
                scope: this,
                click: function(button) {
                    Ext.create('Rally.ui.dialog.SolrArtifactChooserDialog', {
                        artifactTypes: ['userstory'],
                        autoShow: true,
                        multiple: true,
                        title: 'Choose User Stories',
                        listeners: {
                            artifactchosen: function(chooser, selected_records){
                                this._addRecordsToDefaultList(selected_records);
                            },
                            scope: this
                        }
                     });
                }
            }
        });
    },
    _addRecordsToDefaultList: function(records){
        var new_refs = [];
        Ext.Array.each(records,function(record){
            new_refs.push(record.get('_ref'))
        });
        console.log('new items:', new_refs);
        this.default_entries = Ext.Array.merge(this.default_entries,new_refs);
        console.log('default items:', this.default_entries);
        this._updateGrid(this.default_entries);
    },
    _updateGrid: function(references) {
        var promises = [];
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
                
                this.down('#display_box').add(grid);
                
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
    }
});
