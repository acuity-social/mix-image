var $ = require("jquery");
var jpeg = require('jpeg-js');
const pica = require('pica')();
const jpegMipmap = require("./mix_jpeg_mipmap_pb.js");
const item = require("./item_pb.js");
const brotli = require("./brotli.js");
var bro = new brotli.Brotli();

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
    uploadFormData.append("test.jpeg", new File([jpegImageData.data], {type:"application/octet-stream"}));

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
//      console.log(result);
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
            message.addMipmaplevelipfshash(mipmap.Hash);
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
        });
      });
      reader.readAsArrayBuffer(f);
    }
    document.getElementById('list').innerHTML = '<ul>' + output.join('') + '</ul>';
  }

  document.getElementById('files').addEventListener('change', handleFileSelect, false);
  
});
