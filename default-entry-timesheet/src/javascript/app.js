Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    default_entries: [],
    items: [
        {xtype:'container',itemId:'selector_box'},
        {xtype:'container',itemId:'title_box',tpl:'Time Entries for <tpl>{_refObjectName}</tpl>'},
        {xtype:'container',itemId:'message_box'},
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this.down('#title_box').update(this.getContext().getUser());
        var me = this;
        this.setLoading(true);

        var start_of_week = this._getStartOfWeek(new Date());
        
        Deft.Chain.pipeline([
            function() { return me._getSavedDefaults(me.getContext());  },
            function(default_entries) { return me._getSavedTimesheet(me.getContext(),default_entries,start_of_week); }
        ]).then({
            scope: me,
            success: function(defaults_and_time_entries) {
                this.logger.log("Defaults and TIES", defaults_and_time_entries);
                
                var default_entries = defaults_and_time_entries[0];
                var time_entries = defaults_and_time_entries[1];
                                
                if ( default_entries.length == 0 ) {
                    this.down('#message_box').add({
                        xtype:'container',
                        html: 'There are no configured default time entries for ' + this.getContext().getProject()._refObjectName
                    });
                }
                
                if ( time_entries.length == 0 ) {
                    this.down('#message_box').add({
                        xtype:'container',
                        html: 'There are no current timesheet entries for ' + this.getContext().getUser()._refObjectName
                    });
                } 
                
                this._updateGrid(default_entries,time_entries);
            },
            failure: function(msg) {
                alert(msg);
            }
        });
    },
    _updateGrid: function(default_entries, time_entries) {
        var promises = [];
        var container = this.down('#display_box');
        
        container.removeAll();

        Ext.Array.each(time_entries, function(reference){
            promises.push(this._getRecordFromReference(reference,true));
        },this);
        
        Ext.Array.each(default_entries, function(reference){
            if ( Ext.Array.indexOf(time_entries, reference) == -1 ) {
                promises.push(this._getRecordFromReference(reference,false));
            }
        },this);
        
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(records){
                var rows = Ext.Array.flatten(records);
                var store = Ext.create('Rally.data.custom.Store', {
                    data: rows
                });
                
                var me = this;
                
                var grid = Ext.create('Rally.ui.grid.Grid', {
                    store: store,
                    showRowActionsColumn: false,
                    showPagingToolbar: false,
                    columnCfgs: [
                        {dataIndex:'_existing',text:'Saved', renderer: function(value) {
                            
                            var iconName = 'icon-ok';
                            if ( !value ) {
                                iconName = 'icon-upload';
                            }
                            return '<span class="' + iconName + '" style="fontSize:20px;,display:block;" > </span>';
                        }},
                        {
                            xtype: 'rallyrowactioncolumn',
                            rowActionsFn: function (record) {
                                return [
                                    {
                                        xtype: 'tsremoveitemenuitem',
                                        text: 'Remove from this week',
                                        record: record,
                                        handler: function(){
                                            me._removeTimeSheetEntry(record);
                                        }
                                        
                                    }
                                ];
                            }
                        },
                        {dataIndex:'FormattedID',text:'id'},
                        {dataIndex:'Name',text:'Name', flex: 1},
                        {dataIndex:'Project',text:'Project', renderer: function(value){ 
                            if (value && value._refObjectName) {
                                return value._refObjectName
                            }
                            return value;
                        }}
                    ],
                    listeners: {
                        scope: this,
                        render: function() {
                            this.setLoading(false);
                            this._createTimesheetEntries(rows);
                        }
                    }
                });
                
                container.add(grid);
            },
            failure: function(msg){
                alert("Cannot load grid: ", msg);
            }
        });
    },
    _createTimesheetEntries: function(records) {
        Rally.data.ModelFactory.getModel({
            type: 'TimeEntryItem',
            scope: this,
            success: function(model) {
                Ext.Array.each(records, function(record) {
                    if ( ! record.get('_existing') ) {
                        this._createTimesheetEntry(model,record);
                    }
                },this);
            }
        });
    },
    _createTimesheetEntry: function(model,record) {
        var deferred = Ext.create('Deft.Deferred');
                
        var start_of_week = this._getStartOfWeek(new Date());

        var tie_config = {
            WeekStartDate: start_of_week,
            User: { _ref: this.getContext().getUser()._ref },
            WorkProduct: { _ref: record.get("_ref") },
            Project: { _ref: record.get("Project")._ref }
        };
        
        var tie = Ext.create(model,tie_config);
        this.logger.log("Saving TimeSheet Entry", tie_config);
        
        tie.save({
            callback: function(result,operation) {
                record.set('_existing',true);
                record.set('_tie',result);
                
                deferred.resolve(operation);
            }
        });
        
        return deferred.promise;
    },
    _getRecordFromReference: function(reference,existing_entry){
        var deferred = Ext.create('Deft.Deferred');
        var ref_array = reference.split(/\//);
        if ( ref_array.length < 2 ) {
            deferred.reject("Reference must have model and object id");
        } else {
            var oid = ref_array.pop();
            var model = ref_array.pop();
            
            Ext.create('Rally.data.wsapi.Store', {
                model: model,
                fetch: ['Name','FormattedID','ScheduleState','Project','Workspace'],
                filters: [{ property:'ObjectID', value: oid}],
                autoLoad: true,
                context: {
                    project: null
                },
                listeners: {
                    load: function(store, records, successful) {
                        if (successful){
                            Ext.Array.each(records,function(record){
                                record.set('_existing', existing_entry);
                            });
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
    _removeTimeSheetEntry:function(record){
        var deferred = Ext.create('Deft.Deferred');
        this.logger.log("Remove record", record);
        this.logger.log("this.ties",this.ties);
        
        var tie = record.get('_tie');  // new items

        if ( !tie ) {
            // search in old items
            Ext.Array.each(this.ties, function(candidate_tie) {
                var workproduct = candidate_tie.get('WorkProduct');
                if ( workproduct ) {
                    if (workproduct._ref == record.get('_ref')) {
                        tie = candidate_tie;
                    }
                }
            },this);
        }
        
        this.logger.log("using tie", tie);
        
        tie.destroy({
            callback: function(result, operation) {
                if(operation.wasSuccessful()) {
                    record.set('_existing',false);
                    deferred.resolve(operation);
                }
            }
        });
//        
        return deferred.promise;
    },
    _getSavedDefaults: function(context) {
        var deferred = Ext.create('Deft.Deferred');
        
        var project_ref = context.getProject()._ref;

        Rally.data.PreferenceManager.load({
            project: project_ref,
            success: function(prefs) {
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
    },
    _getSavedTimesheet: function(context,default_entries,start_of_week) {
        var deferred = Ext.create('Deft.Deferred');
        
        Ext.create('Rally.data.wsapi.Store',{
            model:'TimeEntryItem',
            autoLoad: true,
            filters: [
                {property:'WeekStartDate',value:start_of_week},
                {property:'User.ObjectID',value:context.getUser().ObjectID}
            ],
            fetch: ['WorkProduct'],
            listeners: {
                scope: this,
                load: function(store,ties){
                    this.logger.log("Time Item Entries", ties);
                    var refs = [];
                    this.ties = ties;
                    Ext.Array.each(ties, function(tie){
                        var workproduct = tie.get('WorkProduct');
                        if ( workproduct && workproduct._ref ) {
                            refs.push(workproduct._ref);
                        }
                    });
                    
                    deferred.resolve([default_entries,refs]);
                }
            }
        });        
        return deferred.promise;
    },
    /*
     * Given a date, return the ISO string for the beginning of the week
     */
    _getStartOfWeek: function(date_in_week){
        if ( typeof(date_in_week) == 'undefined' ) {
            date_in_week = new Date();
        }
        if ( typeof(date_in_week) == "string" ) {
            var timezone_offset = new Date().getTimezoneOffset() / 60;
            var timezone_offset_string = Math.abs(timezone_offset) + ":00";
            
            if ( Math.abs(timezone_offset) < 10 ) {
                timezone_offset_string = "0" + timezone_offset_string;
            }
            if ( timezone_offset > 0 ) {
                timezone_offset_string = "-" + timezone_offset_string;
            } else {
                timezone_offset_string = "+" + timezone_offset_string;;
            }
            if ( ! /Z/.test(date_in_week) ) {
                if ( /T/.test(date_in_week) ) {
                    date_in_week = date_in_week + timezone_offset_string;
                } else {
                    date_in_week = date_in_week + "T00:00:00" + timezone_offset_string;
                }
            }
            date_in_week = Rally.util.DateTime.fromIsoString(date_in_week);
        }
        var day_of_week = date_in_week.getDay();
        var day_of_month = date_in_week.getDate();
        // push to midnight
        date_in_week.setHours(0,0,0,0);
        
        // determine what beginning of week is
        var start_of_week_js = date_in_week;
        start_of_week_js.setDate( day_of_month - day_of_week );
        
        var start_of_week_iso = Rally.util.DateTime.toIsoString(start_of_week_js).replace(/T.*$/,"T00:00:00.000Z");
        return start_of_week_iso;
    }
    
});
