// var dataslayer = {};
// dataslayer.helperListener = function (message,model){
// 	console.info(message);
// 	chrome.runtime.sendMessage(message);
// }

// dataslayer.timerID = window.setInterval(function(){
// 	console.log(document.readyState+'/'+(typeof window.dataLayer));
// 	if (typeof window.dataLayer !== 'undefined') {
// 		dataslayer.helper = new DataLayerHelper(window.dataLayer,dataslayer.helperListener,true);
// 		window.clearInterval(dataslayer.timerID);
// 	}
// 	else if ((document.readyState == 'complete')&&(typeof window.dataLayer == 'undefined')&&(document.querySelector('script[src*=googletagmanager\\.com]') == null)) {console.log('dataslayer: giving up'); window.clearInterval(dataslayer.timerID);}
// },200);
// dataslayer.helper = new DataLayerHelper(dataLayer,dataslayer.helperListener,true);

// chrome.runtime.sendMessage({greeting:'loveyou'});



var dataslayer = {};
dataslayer.helperListener = function(event){
	if ((event.source == window)&&(event.data.type && (event.data.type=='dataslayergtm'))){
		console.info(event.data);
		chrome.runtime.sendMessage(event.data);
	}
};
window.addEventListener('message',dataslayer.helperListener);

var insertScript = 
'(function(){/* jQuery v1.9.1 (c) 2005, 2012 jQuery Foundation, Inc. jquery.org/license.*/'+
'var g=/\\[object (Boolean|Number|String|Function|Array|Date|RegExp)\\]/;function h(a){return null==a?String(a):(a=g.exec(Object.prototype.toString.call(Object(a))))?a[1].toLowerCase():"object"}function k(a,b){return Object.prototype.hasOwnProperty.call(Object(a),b)}function m(a){if(!a||"object"!=h(a)||a.nodeType||a==a.window)return!1;try{if(a.constructor&&!k(a,"constructor")&&!k(a.constructor.prototype,"isPrototypeOf"))return!1}catch(b){return!1}for(var c in a);return void 0===c||k(a,c)};/*'+
' Copyright 2012 Google Inc. All rights reserved. */'+
'function n(a,b,c){this.b=a;this.f=b||function(){};this.d=!1;this.a={};this.c=[];this.e=p(this);r(this,a,!c);var d=a.push,e=this;a.push=function(){var b=[].slice.call(arguments,0),c=d.apply(a,b);r(e,b);return c}}window.DataLayerHelper=n;n.prototype.get=function(a){var b=this.a;a=a.split(".");for(var c=0;c<a.length;c++){if(void 0===b[a[c]])return;b=b[a[c]]}return b};n.prototype.flatten=function(){this.b.splice(0,this.b.length);this.b[0]={};s(this.a,this.b[0])};'+
'function r(a,b,c){for(a.c.push.apply(a.c,b);!1===a.d&&0<a.c.length;){b=a.c.shift();if("array"==h(b))a:{var d=b,e=a.a;if("string"==h(d[0])){for(var f=d[0].split("."),u=f.pop(),d=d.slice(1),l=0;l<f.length;l++){if(void 0===e[f[l]])break a;e=e[f[l]]}try{e[u].apply(e,d)}catch(v){}}}else if("function"==typeof b)try{b.call(a.e)}catch(w){}else if(m(b))for(var q in b)s(t(q,b[q]),a.a);else continue;c||(a.d=!0,a.f(a.a,b),a.d=!1)}}'+
'function p(a){return{set:function(b,c){s(t(b,c),a.a)},get:function(b){return a.get(b)}}}function t(a,b){for(var c={},d=c,e=a.split("."),f=0;f<e.length-1;f++)d=d[e[f]]={};d[e[e.length-1]]=b;return c}function s(a,b){for(var c in a)if(k(a,c)){var d=a[c];"array"==h(d)?("array"==h(b[c])||(b[c]=[]),s(d,b[c])):m(d)?(m(b[c])||(b[c]={}),s(d,b[c])):b[c]=d}};})();'+
'var dataslayer = {}; dataslayer.helperListener = function (message,model){var poster = {type: \'dataslayergtm\',data: JSON.stringify(window.dataLayer)}; window.postMessage(poster,"*");};'+
'dataslayer.timerID = window.setInterval(function(){'+
'if (typeof window.dataLayer !== \'undefined\') { 		console.log(\'dataslayer: found\'); dataslayer.helper = new DataLayerHelper(window.dataLayer,dataslayer.helperListener,true); 		 window.clearInterval(dataslayer.timerID); 	}'+
'else if ((document.readyState == \'complete\')&&(typeof window.dataLayer == \'undefined\')&&(document.querySelector(\'script[src*=googletagmanager\\\\.com]\') == null)) {console.log(\'dataslayer: giving up\'); window.clearInterval(dataslayer.timerID);}'+
'},200);';

// dataslayer.helper = new DataLayerHelper(dataLayer,dataslayer.helperListener,true);


// 'var dataslayer = {};\ndataslayer.helperListener = function (message,model){window.postMessage(message);}\ndataslayer.timerID = window.setInterval(function(){	console.log(document.readyState+\'/\'+(typeof window.dataLayer)); dataslayer.helper = new DataLayerHelper(window.dataLayer,dataslayer.helperListener,true);	console.log(\'dataslayer: datalayer found\'); window.clearInterval(dataslayer.timerID); } '+
// 'else if ((document.readyState == \'complete\')&&(typeof window.dataLayer == \'undefined\')&&(document.querySelector(\'script[src*=googletagmanager\\\.com]\') == null)) {console.log(\'dataslayer: giving up\'); window.clearInterval(dataslayer.timerID);}},200);';

dataslayer.s = document.createElement('script');
dataslayer.s.innerHTML = insertScript;
dataslayer.s.type = 'text/javascript';
document.head.appendChild(dataslayer.s);