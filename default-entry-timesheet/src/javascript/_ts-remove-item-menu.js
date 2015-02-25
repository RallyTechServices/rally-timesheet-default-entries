
Ext.define('Rally.technicalservices.menu.item.RemoveItemMenuItem', {
    extend:'Rally.ui.menu.item.RecordMenuItem',
    alias:'widget.tsremoveitemenuitem',

    config: {
        text: 'Remove from Defaults',
        handler: function() {
            this._onRemoveClicked();
        }
    },

    constructor: function(config) {
        config = config || {};
        
        config.handler = config.handler || this._onRemoveClicked;

        this.initConfig(config);
        this.callParent(arguments);
    },

    _onRemoveClicked: function() {
        alert('Remove clicked.  Should have been implemented');
    }
});