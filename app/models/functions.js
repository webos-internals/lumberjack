function dumpObject( obj ){
        Mojo.Log.info( "====================== DUMP ========================" );
        for( var i in obj ){
                Mojo.Log.info( i + ": " + obj[i] );
        }
        Mojo.Log.info( "====================== /DUMP =======================" );
}

function arrayToObject( arr ){

	var obj = {};
	for( var i = 0; i < arr.length; i++ ) obj[arr[i]] = "";
	return obj;
}

function formatForHtml(string){
    string = string.escapeHTML();
    string = string.replace(/[\s]{2}/g, " &nbsp;");
    return string;
}