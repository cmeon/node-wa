var EventEmitter = require('events').EventEmitter;

if(process.version == "v0.2.3") {
    util = {};
    util.inherits = require('sys').inherits;
} else {
    util = require('util');
}

/* ProtocolTreeNode -- just a basic representation of a XML node */

var ProtocolTreeNode = function(tag, attributes, children, data) {
    //console.log("constructor", tag, attributes, children, data);
    this.tag = tag;
    this.attributes = attributes;
    this.children = children;
    this.data = data;
}

ProtocolTreeNode.prototype.toString = function(indent) {
    var out = indent ? "    " : "";
    out += "<" + this.tag;
    if(this.attributes) {
        for(var x in this.attributes) {
            out += " " + x + '="' + this.attributes[x] + '"';
        }
    }
    out += ">\n";
    if(this.data) {
        out += (indent ? "        " : "    ") + this.data + "\n";
    }
    if(this.children) {
        for(var c in this.children) {
            out += this.children[c].toString({ indent: true });
        }
    }
    out += (indent ? "    " : "") + "</" + this.tag + ">\n";
    return out;
}

ProtocolTreeNode.prototype.tagEquals = function(node, string) {
    return node && node.tag && node.tag === string;
}

ProtocolTreeNode.prototype.require = function(node, string) {
    if(!this.tagEquals(node, string)) {
        throw("failed require. node: " + node + " string: " + string);
    }
}

ProtocolTreeNode.prototype.getChild = function(identifier) {
    if(!this.children || this.children.length == 0) {
        return undefined;
    }
    if(typeof identifier === "number") {
        if(this.children.length > identifier) {
            return this.children[identifier];
        } else {
            return undefined;
        }
    }
    for(var c in this.children) {
        if(identifier === this.children[c].tag) {
            return this.children[c];
        }
    }
    return undefined;
}

ProtocolTreeNode.prototype.getAttributeValue = function(string) {
    if(!this.attributes) {
        return undefined;
    }
    return this.attributes[string];
}

ProtocolTreeNode.prototype.getAllChildren = function(tag) {
    var ret = [];
    if(!this.children) {
        return ret;
    }
    if(!tag) {
        return this.children;
    }
    for(var c in this.children) {
        if(tag === this.children[c].tag) {
            ret.push(this.children[c]);
        }
    }
    return ret;
}

/* BinTreeNodeReader -- give it an input stream, and it should be able to read data into something we can process */

var BinTreeNodeReader = function(inputstream, dictionary, opt) {
    console.log("opt=" + JSON.stringify(opt));
    this.debug = opt ? opt.debug : false;
    console.log("*** Constructing BinTreeNodeReader debug=" + this.debug);
    this.tokenMap = dictionary;
    this.rawIn = inputstream;
    this.inn = new Buffer(0);
    this.buf = new Buffer(1024);
    this.bufSize = 0;
    this.readSize = 1;
    this.innPointer = 0;
}

util.inherits(BinTreeNodeReader, EventEmitter);

BinTreeNodeReader.prototype.streamStart = function() {
    console.log("*** Starting Read on Stream");
    this.rawIn.addListener('data', function dataReceived(data) {
        //console.log("recv: " + data);
        //this.inn = new Buffer(data, "binary");
        this.inn = data;
        if(!this.streamStarted) {
            var out = "";
            for(var x = 0; x < this.inn.length; x++) {
                //out += this.inn.readUInt8(x) + " ";
                out += this.inn[x] + " ";
            }
            //console.log(out);
            var stanzaSize = this.readInt16();
            //console.log("stanzaSize=" + stanzaSize);
            //this.fillBuffer(stanzaSize);
            var tag = this.readInt8();
            //console.log("tag=" + tag);
            var size = this.readListSize(tag);
            //console.log("list size=" + size);
            tag = this.inn[this.innPointer++];
            if(tag != 1) {
                throw("Expecting tag 1 (STREAM_START) received " + tag);
            }
            console.log("*** Found STREAM_START");
            var attribCount = (size - 2 + size % 2) / 2;
            var attributes = this.readAttributes(attribCount);
            //console.log("attributes=" + JSON.stringify(attributes));
            this.streamStarted = true;
        }
        for(var x = this.innPointer; x < this.inn.length; x++) {
            console.log("getting next tree at character " + this.innPointer + " of " + this.inn.length);
            var next = this.nextTree();
            x = this.innPointer;
        }
        this.innPointer = 0;
        this.inn = new Buffer("");
    }.bind(this));
}

BinTreeNodeReader.prototype.nextTree = function() {
    var stanzaSize = this.readInt16();
    console.log("next stanzaSize=" + stanzaSize);
    return this.nextTreeInternal();
}

BinTreeNodeReader.prototype.nextTreeInternal = function() {
    var node;
    //console.log("**** nextTreeInternal");
    var b = this.readInt8();
    //console.log(this.innPointer + " junk list tag? " + b);
    var size = this.readInt8();
    //console.log("size=" + size);
    //var buf = Buffer(size);
    //this.inn.copy(buf, 0, this.innPointer, this.innPointer + size);
    //this.innPointer += size;
    
    b = this.readInt8();
    if(b == 2) {
        console.log("Stream closed, received tag 2");
        return undefined;
    }
    //console.log(this.innPointer + " b = " + b);
    var tag = this.readString(b);
    //console.log("tag=" + tag);
    if(size == 0 || !tag) {
        throw("nextTree sees 0 list or null tag");
    }
    var attribCount = (size - 2 + size % 2) / 2;
    //console.log("attribCount=" + attribCount + " " + size % 2);
    attribs = this.readAttributes(attribCount);
    //console.log("attribs=" + JSON.stringify(attribs));
    if(size % 2 == 1) {
        //console.log("creating node (1)");
        node = new ProtocolTreeNode(tag, attribs);
    }
    if(!node) {
        b = this.readInt8();
        if(this.isListTag(b)) {
            //console.log("*** reading list");
            //console.log("creating node(2)");
            node = new ProtocolTreeNode(tag, attribs, this.readList(b));
            //return new ProtocolTreeNode(tag, attribs, this.readList(b));
            //console.log("*** finished reading list");
        }
        if(!node) {
            //console.log("creating node(3)");
            node = new ProtocolTreeNode(tag, attribs, undefined, this.readString(b));
        }
    }
    //console.log("node.tag=" + node.tag);
    
    switch(node.tag) {
        case "challenge":
            this.emit('challenge', node);
            break;
        case "success":
            this.emit('loggedin', node);
            break;
        case "received": // received is a sub of message, do not pass it on
        case "notify": // received is a sub of message, do nto pass it on
        case "request": // request is a sub of message, do not pass it on
        case "media": // media is a sub of message, do not pass it on
        case "category": // category is a sub of presence, perhaps others? who knows
        case "ping": // ping is a sub of iq
            break;
        case "iq":
            this.emit('iq', node);
            break;
        case "presence":
            this.emit('presence', node);
            break;
        case "message":
            this.emit('message', node);
            break;
        case "stream:error":
            this.emit('streamError', node);
            break;
        default:
            this.emit('stanza', node);
            break;
    }
    return node;
}

BinTreeNodeReader.prototype.isListTag = function(b) {
    return b == 248 || b == 0 || b == 249;
}

BinTreeNodeReader.prototype.readList = function(token) {
    var size = this.readListSize(token);
    //console.log("reading list of size " + size);
    var listx = [];
    for(var i = 0; i < size; i ++) {
        listx.push(this.nextTreeInternal());
    }
    return listx;
}

BinTreeNodeReader.prototype.readInt8 = function() {
    //return this.inn.readUInt8(this.innPointer++);
    return this.inn[this.innPointer++];
}

BinTreeNodeReader.prototype.readInt16 = function() {
    //console.log("readInt16:" + (this.inn.charCodeAt(this.innPointer) + this.inn.charCodeAt(this.innPointer+1)));
    //var value = this.inn.charCodeAt(this.innPointer) + this.inn.charCodeAt(this.innPointer+1);
    //this.innPointer += 2;
    //return value;
    return this.readInt8() + this.readInt8();
}

BinTreeNodeReader.prototype.readInt24 = function() {
    //var int1 = this.inn[this.innPointer++];
    //var int2 = this.inn[this.innPointer++];
    //var int3 = this.inn[this.innPointer++];
    //value = (int1 << 16) + (int2 << 8) + (int3 << 0);
    //return value;
    return this.readInt8() + this.readInt8() + this.readInt8();
}

BinTreeNodeReader.prototype.readListSize = function(token) {
    var size = 0;
    if(token == 0) {
        size = 0;
    } else {
        if(token == 248) {
            size = this.readInt8();
        } else {
            if(token == 249) {
                size = this.readInt16();
            } else {
                throw("invalid list size in readListSize token " + token);
            }
        }
    }
    return size;
}

BinTreeNodeReader.prototype.fillBuffer = function(size) {
    this.innPointer += size;
}

BinTreeNodeReader.prototype.readAttributes = function(attribCount) {
    var attribs = { };
    for(var i = 0; i < attribCount; i++) {
        //console.log("read attribute " + i);
        var key = this.readString(this.readInt8());
        //console.log("key=" + key);
        var value = this.readString(this.readInt8());
        //console.log("value=" + value);
        attribs[key] = value;
    }
    return attribs;
}

BinTreeNodeReader.prototype.getToken = function(token) {
    if(token >= 0 && token < this.tokenMap.length) {
        var ret = this.tokenMap[token];
    } else {
        throw("invalid token/length in getToken " + token);
    }
    return ret;
}

BinTreeNodeReader.prototype.readString = function(token) {
    //console.log("****** READSTRING TOKEN=" + token);
    if(token == -1) {
        throw("-1 token in readString");
    }
    if(token > 0 && token < 245) {
        return this.getToken(token);
    }
    if(token == 0) {
        return undefined;
    }
    if(token == 252) {
        var size8 = this.readInt8();
        //var buf8 = Buffer(size8, "binary");
        var buf8 = this.inn.slice(this.innPointer, this.innPointer + size8);
        //this.inn.copy(buf8, this.innPointer, size8);
        this.innPointer += size8;
        //console.log("buf8=" + buf8.toString("binary"));
        return buf8.toString("ascii");
    }
    if(token == 253) {
        try {
            var size24 = this.readInt24();
            //var buf24 = new Buffer(size24, "binary");
            var buf24 = this.inn.slice(this.innPointer, this.innPointer + size8);
            //this.inn.copy(buf24, this.innPointer, size24);
            this.innPointer += size24;
            return buf24.toString("ascii");
        } catch(err) {
            return "Bad Buf24 read";
        }
    }
    if(token == 254) {
        token = this.readInt8();
        return this.getToken(245 + token);
    }
    if(token == 250) {
        var user = this.readString(this.readInt8());
        var server = this.readString(this.readInt8());
        if(user && server) {
            return user + "@" + server;
        } else if(server) {
            return server;
        } else {
            throw("readString couldn't reconstruct jid");
        }
    }
    throw("readString couldn't match token " + token);
}

/* BinTreeNodeWriter -- this should output junk to our output stream */

var BinTreeNodeWriter = function(outputstream, dictionary, opt) {
    this.debug = opt ? opt.debug : false;
    console.log("*** Constructing BinTreeNodeWriter debug=" + this.debug);
    this.realOut = outputstream;
    this.tokenMap = {};
    this.out = new Buffer("");
    for(var i = 0; i < dictionary.length; i++) {
        if(dictionary[i]) {
            //console.log("add key " + i + " " + dictionary[i]);
            this.tokenMap[dictionary[i]] = i;
        }
    }
    //console.log(JSON.stringify(this.tokenMap));
}

/*
 * 01 - stream:stream
 * 00 00
 * x19 = 25 = packet length
 * f8 = 248 = list start
 * 05 = 05 = list length
 * 01 = 01 = stream:start
 * a0 = 160 = to
 * 8a = 138 = s.whatsapp.net
 * 84 = 132 = resource
 * fc = 252 = 8-bit length is next byte
 * 11 = 17 = length 17
 * iPhone-2.6.9-5222
 * 00
 * 08 = 08 = packet length
 * f8 = 248 = list start
 * 02 = 02 = length of list
 * 96 = 150 = stream:features
 * f8 = 248 = list start
 * 01 = 01 = length of list
 * f8 = 248 = list start
 * 01 = 01 = length of list
 * 7e = 126 = receipt_acks
 * 00
 * 07 = 07 = packet length
 * f8 = 248 = list start
 * 05 = 05 = length of list
 * 0f = 15 = auth
 * 5a = 90 = mechanism?
 * 2a = 42 = DIGEST-MD5-1
 * bd = 189 = xmlns
 * a7 = 167 = urn:ietf:params:xml:ns:xmpp-sasl
 */

BinTreeNodeWriter.prototype.streamStart = function(domain, resource) {
    console.log("*** Starting Write on Stream");
    /*
    var outputBuffer = Buffer("WA\x01\x00", "binary");
    this.realOut.write(outputBuffer);
    outputBuffer = Buffer("\x00\x19\xf8\x05\x01\xa0\x8a\x84\xfc\x11" + "iPhone-2.6.9-5222", "binary");
    this.realOut.write(outputBuffer);
    outputBuffer = Buffer("\x00\x08\xf8\x02\x96\xf8\x01\xf8\x01\x7e\x00", "binary");
    this.realOut.write(outputBuffer);
    outputBuffer = Buffer("\x07\xf8\x05\x0f\x5a\x2a\xbd\xa7", "binary");
    this.realOut.write(outputBuffer);
    */
    var out = new Buffer("WA\x01\x00", "binary");
    this.realOut.write(out);
    //console.log("*** Write: " + out.toString("hex"));
    
    var node = new ProtocolTreeNode("stream:stream", { "to": domain, "resource": resource } );
    this.write(node);
    //this.flushBuffer();*/
    
    /*var streamOpenAttributes = { "to": domain, "resource": resource };
    this.realOut.write(out);
    console.log("write streamStart: " + out.toString("hex"));
    this.writeListStart(2 * 2 + 1); // this should be streamOpenAttributes.length, but objects in JS don't do length
    this.realOut.write("\x01");
    console.log("write streamStart: 01");
    this.writeAttributes(streamOpenAttributes);*/
}

BinTreeNodeWriter.prototype.writeListStart = function(i) {
    if(i == 0) {
        return new Buffer("\x00");
    } else if(i < 256) {
        return new Buffer("\xf8" + this.writeInt8(i).toString("binary"), "binary");
    } else {
        return new Buffer("\xf9" + this.writeInt16(i).toString("binary"), "binary");
    }
}

BinTreeNodeWriter.prototype.writeJid = function(user, server) {
    //console.log("writeJid " + user + " " + server);
    var x = Buffer("\xFA" + (user ? this.writeString(user) : this.writeToken(0)).toString("binary") + this.writeString(server).toString("binary"), "binary");
    //var sb = this.writeString(server);
    //console.log("**** Server byte: " + sb[0]);
    //console.log("writing jid " + x.toString());
    /*
    var out = "";
    for(var i = 0; i < x.length; i++) {
        out += x[i] + " ";
    }
    console.log("jid out: " + out);*/
    return x.toString("binary");
}

BinTreeNodeWriter.prototype.writeAttributes = function(attributes) {
    var buf = new Buffer("");
    if(attributes) {
        for(var x in attributes) {
            var key = this.writeString(x);
            //console.log("key=" + key.toString("hex"));
            var val = this.writeString(attributes[x]);
            //console.log("val=" + val.toString("hex"));
            buf = new Buffer(buf.toString("binary") + key.toString("binary") + val.toString("binary"), "binary");
        }
    }
    return buf;
}

BinTreeNodeWriter.prototype.writeString = function(tag) {
    //console.log("writeString tag=" + tag);
    var key = this.tokenMap[tag];
    //console.log("writeString tag=" + tag + " key=" + this.tokenMap[tag]);
    if(key) {
        //console.log("writeString key=" + key);
        return this.writeToken(key);
    } else {
        var atIndex = tag.indexOf('@');
        if(atIndex < 1) {
            //console.log("writeString: " + tag);
            //this.realOut.write(tag);
            return this.writeBytes(tag);
        } else {
            var server = tag.substring(atIndex+1, tag.length);
            var user = tag.substring(0, atIndex);
            return this.writeJid(user, server);
        }
    }
}

BinTreeNodeWriter.prototype.writeToken = function(intValue) {
    if(intValue < 245) {
        //console.log("writeToken: " + intValue);
        return this.writeInt8(intValue);
    } else if(intValue <= 500) {
        //console.log("writeToken: fe " + intValue - 245);
        return new Buffer("\xFE" + this.writeInt8(intValue - 245).toString("binary"), "binary");
    }
}

BinTreeNodeWriter.prototype.writeBytes = function(bytes) {
    var length = bytes.length;
    var buf;
    if(length >= 256) {
        buf = new Buffer("\xfd" + this.writeInt24(length).toString("binary"), "binary"); // 253
    } else {
        buf = new Buffer("\xfc" + this.writeInt8(length).toString("binary"), "binary"); // 252
    }
    buf = new Buffer(buf.toString("binary") + bytes, "binary");
    return buf;
}

BinTreeNodeWriter.prototype.write = function(node, needsFlush) {
    if(!node) {
        this.writeInt8(0);
    } else {
        this.writeInternal(node);
    }
    this.flushBuffer();
}

BinTreeNodeWriter.prototype.writeInternal = function(node) {
    console.log("*** writeInternal " + node);
    var attlength = 0;
    if(node.attributes) {
        for(var x in node.attributes) {
            if(node.attributes.hasOwnProperty(x))
                attlength++;
        }
    }
    var x = 1 + (node.attributes ? attlength * 2 : 0) + (node.children ? 1 : 0) + (node.data ? 1 : 0);
    //console.log("x=" + x);
    
    var liststart = this.writeListStart(x);
    //console.log("liststart=" + liststart.toString("hex"));
    
    var tagstring = this.writeString(node.tag);
    //console.log("tagstring=" + tagstring.toString("hex"));
    
    var attrib = this.writeAttributes(node.attributes);
    //console.log("attrib=" + attrib.toString("hex"));
    
    
    this.out = new Buffer(this.out.toString("binary") + liststart.toString("binary") + tagstring.toString("binary") + attrib.toString("binary"), "binary");
    if(node.data) {
        this.out = new Buffer(this.out.toString("binary") + this.writeBytes(node.data).toString("binary"), "binary");
    }
    if(node.children) {
        this.out = new Buffer(this.out.toString("binary") + this.writeListStart(node.children.length).toString("binary"), "binary");
        for(var c in node.children) {
            this.writeInternal(node.children[c]);
        }
    }
    //console.log("writeInternal new buffer=" + this.out.toString("hex"));
}

BinTreeNodeWriter.prototype.flushBuffer = function() {
    //console.log("***** flushBuffer");
    var size = this.out.length;
    //if(size & 0xFFFF0000 != 0) {
        //throw("Output buffer too large: " + size);
    //}
    var x = this.writeInt16(size);
    var buf = new Buffer(x.toString("binary") + this.out.toString("binary"), "binary");
    if(this.debug) {
        var out = "";
        //console.log("flushing buffer of size " + size + " " + x.toString("hex"));
        //console.log("flush buffer: " + buf.toString("hex"));
        for(var i = 0; i < buf.length; i++) {
            out += buf[i] + " ";
        }
        console.log("flushing buffer of size " + size + ": " + out);
    }
    this.realOut.write(buf, "binary");
    //this.realOut.write(this.out);
    this.out = new Buffer("");
}

BinTreeNodeWriter.prototype.writeInt8 = function(v) {
    return new Buffer("" + String.fromCharCode(v), "binary");
}

BinTreeNodeWriter.prototype.writeInt16 = function(v) {
    //console.log("writeInt16, v=" + v + " " + String.fromCharCode(v) + " " + ( (v >> 8) & 0xFF) + " " + (v & 0xFF));
    return new Buffer(this.writeInt8( (v >> 8) & 0xFF).toString("binary") + this.writeInt8(v & 0xFF).toString("binary"), "binary");
}

BinTreeNodeWriter.prototype.writeInt24 = function(v) {
    return new Buffer(this.writeInt8( (v >> 16) & 0xFF).toString("binary") + this.writeInt8( (v >> 8) & 0xFF).toString("binary") + this.writeInt8(v & 0xFF).toString("binary"), "binary");
}

exports.ProtocolTreeNode = ProtocolTreeNode;
exports.BinTreeNodeReader = BinTreeNodeReader;
exports.BinTreeNodeWriter = BinTreeNodeWriter;