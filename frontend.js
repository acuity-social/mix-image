var $ = require("jquery");
var jpeg = require('jpeg-js');
const pica = require('pica')();
const jpegMipmap = require("./mix_jpeg_mipmap_pb.js");
const item = require("./item_pb.js");
const brotli = require("./brotli.js");
var bro = new brotli.Brotli();
const Base58 = require("base-58");
const multihash = require('multihashes');

const Web3 = require('web3');
var web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8645"));

const itemStoreIpfsSha256Abi = require('./mix-item-store/item_store_ipfs_sha256.abi.json');
const itemStoreIpfsSha256Factory = web3.eth.contract(itemStoreIpfsSha256Abi);
const itemStore = itemStoreIpfsSha256Factory.at("0xc57631b8f0b4b2eca51f02b695c877917297f54f");


function scaleImage(rawImageData, width, height) {
  return pica.resizeBuffer({
    src: rawImageData.data, 
    width: rawImageData.width, 
    height: rawImageData.height,
    toWidth: width,
    toHeight: height
  }).then(result => {
    rawImageData = {
      data: result,
      width: width,
      height: height
    };
    var jpegImageData = jpeg.encode(rawImageData, 70);

    var uploadFormData = new FormData();
    uploadFormData.append("", new File([jpegImageData.data], {type:"application/octet-stream"}));

    return $.ajax({
      url: "http://127.0.0.1:5001/api/v0/add",
      method: "POST",
      data: uploadFormData,
      cache: false,
      processData: false, // Don't process the files
      contentType: false,
      mimeType: "application/json",
      dataType: "json"
    })
    .done(function(result) {
      console.log(result.Hash);
    })
    .fail(function(jqXHR, textStatus, errorThrown) {
      console.log(textStatus);
      console.log(errorThrown);
    });
  });
}

$(function() {
  "use strict";

  // Check for the various File API support.
  if (window.File && window.FileReader && window.FileList && window.Blob) {
    // Great success! All the File APIs are supported.
  } else {
    alert('The File APIs are not fully supported in this browser.');
  }

  function handleFileSelect(evt) {
    var files = evt.target.files; // FileList object

    // files is a FileList of File objects. List some properties.
    var output = [];
    for (var i = 0, f; f = files[i]; i++) {
      output.push('<li><strong>', escape(f.name), '</strong> (', f.type || 'n/a', ') - ',
                  f.size, ' bytes, last modified: ',
                  f.lastModifiedDate ? f.lastModifiedDate.toLocaleDateString() : 'n/a',
                  '</li>');
                  
      var reader = new FileReader();
      reader.onload = (function(event) {
        var rawImageData = jpeg.decode(event.target.result);
        var mipmaps = [];
        

        var uploadFormData = new FormData();
        uploadFormData.append("", new File([event.target.result], {type:"application/octet-stream"}));

        mipmaps.push($.ajax({
          url: "http://127.0.0.1:5001/api/v0/add",
          method: "POST",
          data: uploadFormData,
          cache: false,
          processData: false, // Don't process the files
          contentType: false,
          mimeType: "application/json",
          dataType: "json"
        })
        .done(function(result) {
          console.log(result.Hash);
        })
        .fail(function(jqXHR, textStatus, errorThrown) {
          console.log(textStatus);
          console.log(errorThrown);
        }));

        var level = 1;
        do {
          var scale = Math.pow(2, level);
          var width = Math.floor(rawImageData.width / scale);
          var height = Math.floor(rawImageData.height / scale);
          console.log(level, width, height);
          mipmaps.push(scaleImage(rawImageData, width, height));
          level++;
        }
        while (width > 64 && height > 64);

        Promise.all(mipmaps).then(mipmaps => {
          var message = new jpegMipmap.JpegMipmap();
          message.setWidth(rawImageData.width);
          message.setHeight(rawImageData.height);
          mipmaps.forEach(function(mipmap) {
            message.addMipmaplevelfilesize(mipmap.Size);
            message.addMipmaplevelipfshash(Base58.decode(mipmap.Hash));
          });

          var mixinPayload = message.serializeBinary();

          var mixinMessage = new item.Mixin();
          mixinMessage.setMixinId(0);
          mixinMessage.setPayload(mixinPayload);

          var itemMessage = new item.Item();
          itemMessage.addMixins(mixinMessage);

          var itemPayload = itemMessage.serializeBinary();
          console.log(itemPayload.length);

          var output = bro.compressArray(itemPayload, 11);
          console.log(output.length);

					var uploadFormData = new FormData();
					uploadFormData.append("", new File([Buffer.from(output).toString('binary')], {type:"application/octet-stream"}));

					return $.ajax({
						url: "http://127.0.0.1:5001/api/v0/add",
						method: "POST",
						data: uploadFormData,
						cache: false,
						processData: false, // Don't process the files
						contentType: false,
						mimeType: "application/json",
						dataType: "json"
					})
					.done(function(result) {
						console.log(result.Hash);
				    var decodedHash = multihash.decode(multihash.fromB58String(result.Hash));
				    console.log(decodedHash);
				    
				    if (decodedHash.name != "sha2-256") {
				      throw "Wrong type of multihash.";
				    }
				    
				    var hashHex = "0x" + decodedHash.digest.toString("hex");
				    console.log(hashHex);

				    web3.eth.defaultAccount = web3.eth.accounts[4];
				    
		        var flagsNonce = "0x00" + web3.sha3(Math.random().toString()).substr(4);
				    var itemId = itemStore.getNewItemId(flagsNonce);
				    console.log(itemId);
				    itemStore.create(flagsNonce, hashHex, {gas: 1000000});
					})
					.fail(function(jqXHR, textStatus, errorThrown) {
						console.log(textStatus);
						console.log(errorThrown);
					});

        });
      });
      reader.readAsArrayBuffer(f);
    }
    document.getElementById('list').innerHTML = '<ul>' + output.join('') + '</ul>';
  }

  document.getElementById('files').addEventListener('change', handleFileSelect, false);
  
});
