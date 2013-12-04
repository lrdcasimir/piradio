
var mdns = require("mdns");
var http = require("http");
var fs = require("fs");
var _ = require("underscore");
var url = require("url");
var mpd = require("mpd");

var listenPort = 1234
var ad = mdns.createAdvertisement(mdns.makeServiceType("readToMe", "tcp"), listenPort);
ad.start();

var paused = false;
var currentlyPlaying = "";

var client = mpd.connect({
    port: 6600,
    host: 'localhost'
})

client.on('error',function(e){
    console.log(e);
})

client.on('ready',function(){
    console.log('mpd ready');
    client.sendCommand(mpd.cmd('update', []),function(){
        console.log('updated');
    });
})

var dirToJsonHash = function(err,files,root, tree, parent,pending,done){
    if(files){
        pending += files.length
    } else {
        if(!--pending) done(tree);
    }
    
    _.each(files,function(file){
        fs.stat(root + "/"+ file, function(err, fileStat){
            if(err){
                console.log(err)
                done(tree)
            }
            
            if(fileStat && fileStat.isDirectory()){
                console.log(root+"/" + file + " is a directory");
                if(!parent[file]) parent[file] = {};
                fs.readdir(root+"/"+file, function(err,innerFiles){
                    console.log(innerFiles)
                    --pending;
                    dirToJsonHash(err,innerFiles, root+"/"+file ,tree,parent[file],pending,done);
                });
                
            } else if(fileStat) {
                console.log("adding " + file + " to array for "+ parent);
                parent[file] = fileStat;
                if(!--pending) done(tree);
            } else {
                if(!--pending) done(tree);
            }
        
        });
    });

};

//Server
var listerService = http.createServer(function(request, response){
    response.writeHead(200, {"Content-Type": "application/json"});
    dispatch(request,response);

});


//main dispatcher
var dispatch = function(request, response){
    try{
        if(request.method == 'POST' || request.method == 'GET'){
            switch(url.parse(request.url).pathname){
        
            
            case "/play":
                return play(request, response);
            case "/pause":
                return pause(request, response);
            case "/stop":
                return stopPlaying(request,response);
            case "/":
            default:
                return listAll(request, response);
            }
        }
        return listAll(request,response); 
    } catch (e){
        console.log(e.message);
        response.end('error');
    }
    
}

var listAll = function(request, response){
    var root = "./books"
    var tree = {};
    tree[root] = {}
    var udid = url.parse(request.url, true).query['udid'];
    console.log("udid: " + udid);
    fs.readdir(root, function(err,files){tree = dirToJsonHash(err,files,root,tree,tree[root],0,function(tree){
        response.end(JSON.stringify(tree));
    })});
}

/**
 * Radio controls
 */

var play = function(request, response){
    var chapterPath = url.parse(request.url, true).query['chapterPath'];
    var addChapter = function(){
        if(!chapterPath && !paused){
            return response.end(JSON.stringify({status:"not playing"}));
        }
        client.sendCommand(mpd.cmd('add', [chapterPath]),function(mpdResponse){
            console.log(mpdResponse);
            return startPlayback();
        });
        
    };
    
    var startPlayback = function(){
        client.sendCommand(mpd.cmd('play',[]),function(playResponse){
            console.log(playResponse);
            paused = false;
            return mpdComplete(playResponse);
        });
    };
    var mpdComplete = function (mpdResponse){
       return response.end(JSON.stringify({status:'playing'})); 
    };
    if(paused && chapterPath == currentlyPlaying){
        return startPlayback();
    }
    
    console.log('playing: ' + chapterPath);
    
    
    client.sendCommand(mpd.cmd('clear',[]),function(mpdResponse){
        currentlyPlaying = chapterPath;
        return addChapter(); 
    });
    
    
    
}

var pause = function(request, response){
    client.sendCommand(mpd.cmd('pause',[]), function(mpdResponse){
        mpdComplete(mpdResponse);
    })
    var mpdComplete = function(mpdResponse){
        paused = true;
        response.end(JSON.stringify({status:'paused'}));
    };
}

var stopPlaying = function(request, response){
    paused = false;
    client.sendCommand(mpd.cmd('stop',[]),function(){
        return response.end(JSON.stringify({status:'stopped'}));
    });
    
}


//Start everything
listerService.listen(listenPort);


