/* global chrome */
import React, { Component } from 'react';
import uuid from 'uuid';
import { GlobalHotKeys } from 'react-hotkeys';
import Page from './Page';
import Settings from './Settings';
import Options from './Options';
import Search from './Search';
import demoData from './demoData';
import { defaults } from './optionMap';
import { isChrome, isFirefox, isDevTools } from './helpers';

let dataslayer = {};
if (!isDevTools()) {
  dataslayer = demoData;
}
else {
  dataslayer = {
    datalayers: [{}],
    utagDatas: [{}],
    tcoDatas: [{}],
    varDatas: [{}],
    dtmDatas: [{}],
    tags: [[]],
    GTMs: [[]],
    DTMs: [[]],
    TLMs: [],
    TCOs: [],
    vars: [[]],
    activeIndex: 0,
    urls: [],
    timestamps: [],
    options: Object.assign({}, defaults)
  };
}

// collapseStack
// - obj: object to populate based on keys
// - keys: array of key names (i.e. to populate test.demo.property, ['test','demo','property'])
// - val: value for key to be assigned
// returns stacked object
function collapseStack(obj, keys, val) {
  let result = obj;
  if ((keys.length < 2) && (Array.isArray(val))) {
    result[keys[0]] = val.slice(0);
  } else if (keys.length < 2) {
    result[keys[0]] = val;
  } else {
    result[keys[0]] = collapseStack(obj[keys[0]] || {}, keys.slice(1), val);
  }
  return result;
}

// collapseUDO
// - udo: Tealium-style data object
// returns data object with properties converted to object paradigm
function collapseUDO(udo) {
  let newUDO = {};
  let props = Object.getOwnPropertyNames(udo).sort();
  for (let i in props) {
    if (props.hasOwnProperty(i)) {
      let stack = props[i].split('.');
      if (stack.length === 1) {
        newUDO[stack[0]] = udo[stack[0]];
      } else {
        newUDO[stack[0]] = newUDO[stack[0]] || {};
        newUDO[stack[0]] = collapseStack(newUDO[stack[0]], stack.slice(1), udo[props[i]]);
      }
    }
  }
  return newUDO;
}

class Dataslayer extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ...dataslayer,
      showOptions: false,
      searchMode: false,
      searchQuery: '',
      port: (isDevTools() ? chrome.runtime.connect() : null),
    };
  }

  componentDidMount() {
    this.loadSettings();
    if (isDevTools()) {
      if (chrome.devtools.panels.themeName === 'dark') {
        this.setState({ darkTheme: true });
      }

      // check for existing requests
      chrome.devtools.network.getHAR((harlog) => {
        if (harlog && harlog.entries) {
          harlog.entries.forEach((v, i, a) => {
            this.newRequest(v);
          });
        }
      });

      // Set up listeners
      if (isChrome()) {
        // We only use onNavigated in Chrome because the timing is a bit off
        // in Firefox. Until the below bug is fixed, Firefox uses
        // webNavigation.onCommitted.
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1552686
        chrome.devtools.network.onNavigated.addListener(this.newPageLoad);
      }
      chrome.devtools.network.onRequestFinished.addListener(this.newRequest);
      this.state.port.onMessage.addListener(this.messageListener);

      // WIP support for History API.
      //
      // chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      //   if (tabId !== chrome.devtools.inspectedWindow.tabId) {
      //     return;
      //   } else {
      //     if (changeInfo.url) {
      //       this.newPageLoad(changeInfo.url);
      //     }
      //     console.log(changeInfo);
      //   }
      // });

      // inject content script
      chrome.runtime.sendMessage({
        type: 'dataslayer_opened',
        tabId: chrome.devtools.inspectedWindow.tabId
      });
    }
  }

  setOption = (option, value) => {
    let options = this.state.options;
    if (typeof value === 'boolean') {
      options[option] = value;
    } else if (typeof value === 'string') {
      if (value.length === 0) {
        options[option] = [];
      } else {
        options[option] = value.split(';');
      }
    }

    try {
      localStorage['options'] = JSON.stringify(options);
    }
    catch(error) {
      console.log(error);
    }

    if (isDevTools()) {
      chrome.storage.sync.set(options);
    }

    this.setState({
      options
    });
  }

  importFile = (e, callback) => {
    let file = e.target.files[0];
    if (!file) {
      callback({ success: false });
    }
    let reader = new FileReader();
    reader.onload = (loaded) => {
      let contents = loaded.target.result;
      console.log(contents);
      let parsed;
      try {
        parsed = JSON.parse(contents);
        this.clearHistory();
        this.setState({ ...parsed });
        this.forceUpdate();
        callback({ success: true });
      } catch (error) {
        console.log(error);
        callback({ success: false, message: 'Malformed JSON in import' });
      }
    };
    reader.readAsText(file);
  }

  // Called when a user navigates to a new page
  newPageLoad = (newurl) => {
    console.log(newurl);
    let newIndex = this.state.activeIndex + 1;
    let { datalayers, GTMs, urls, timestamps, tags } = this.state;
    datalayers[newIndex] = {};
    GTMs[newIndex] = [];
    urls[newIndex] = newurl;
    timestamps[newIndex] = new Date().valueOf();
    tags[newIndex] = [];

    this.loadSettings();
    this.setState({
      loading: true,
      // activeIndex: this.state.activeIndex + 1,
      // datalayers: [...this.state.datalayers, {}],
      // GTMs: [...this.state.GTMs, []],
      // urls: [...this.state.urls, newurl],
      // tags: [...this.state.tags, []]
      activeIndex: newIndex,
      datalayers,
      GTMs,
      urls,
      timestamps,
      tags
    });

    if (isDevTools()) {
      chrome.runtime.sendMessage({ type: 'dataslayer_pageload', tabId: chrome.devtools.inspectedWindow.tabId });
    }
  }

  // newRequest: called on a new network request of any kind
  // we use this to capture tags for parsing
  newRequest = (request) => {
    if ((Number(request.response.status) === 307) ||
      // Fix issue #50 by ignoring 400 statuses
      (Number(request.response.status) === 400)) {
      // don't double count internally redirected requests
      return;
    }

    let reqType = '';
    if (/__utm\.gif/i.test(request.request.url)) {
      if (/stats\.g\.doubleclick\.net/i.test(request.request.url)) {
        reqType = 'dc_js';
      } else {
        reqType = 'classic';
      }
    } else if (/google-analytics\.com\/(.\/)?collect/i.test(request.request.url)) {
      reqType = 'universal';
    } else if (/analytics\.google\.com\/(.\/)?collect/i.test(request.request.url)) {
      reqType = 'ga4';
    } else if ((/\.doubleclick\.net\/activity/i.test(request.request.url.split('?')[0])) &&
      (request.response.status !== 302)) {
      reqType = 'floodlight';
    } else if (/\/b\/ss\//i.test(request.request.url)) {
      reqType = 'sitecatalyst';
    } else {
      // break out if it's not a tag we're looking for
      return;
    }

    let requestURI;

    if (request.request.method === 'GET') {
      requestURI = (reqType === 'floodlight') ? request.request.url : request.request.url.split('?')[1];
    } else if (request.request.method === 'POST') {
      if (request.request.postData && request.request.postData.text) {
        requestURI = request.request.postData.text;
      } else {
        requestURI = (reqType === 'floodlight') ? request.request.url : request.request.url.split('?')[1];
      }
    }

    // parse query string into key/value pairs
    let queryParams = {};
    switch (reqType) {
      case 'classic':
      case 'universal':
      case 'ga4':
      case 'dc_js':
      case 'sitecatalyst': {
        try {
          requestURI.split('&').forEach((pair) => {
            pair = pair.split('=');
            try {
              if (this.state.options.dontDecode) {
                queryParams[pair[0]] = pair[1] || '';
              } else {
                queryParams[pair[0]] = decodeURIComponent(pair[1] || '');
              }
            } catch (e) {
              console.log(`${e} error with ${pair[0]} = ${pair[1]}`);
            }
          });
        } catch (e) {
          console.log(`error ${e} with url ${request.request.url}`);
        }

        break;
      }
      case 'floodlight': {
        requestURI.split(';').slice(1).forEach((pair) => {
          pair = pair.split('=');
          queryParams[pair[0]] = decodeURIComponent(pair[1] || '');
        });
  
        break;
      }
      default:
        break;
    }

    let utmParams = {
      reqType,
      allParams: queryParams
    };

    // push params we're looking for if it's not a floodlight (we'll just show them all)
    if ((reqType !== 'floodlight') && (reqType !== 'sitecatalyst')) {
      const utmTestParams = [
        // GA Universal
        'tid', 't', 'dl', 'dt', 'dp', 'ea', 'ec', 'ev', 'el', 'ti', 'ta', 'tr', 'ts', 'tt',
        'in', 'ip', 'iq', 'ic', 'iv', 'cu', 'sn', 'sa', 'st', 'uid', 'linkid', 'pa',
        // GA classic
        '_utmz', 'utmac', 'utmcc', 'utme', 'utmhn', 'utmdt', 'utmp', 'utmt', 'utmsn',
        'utmsa', 'utmsid', 'utmtid', 'utmtto', 'utmtsp', 'utmttx', 'utmtst', 'utmipn',
        'utmiqt', 'utmipc', 'utmiva', 'utmipr', 'utmpg'
      ];
      let utmCM = {};
      let utmCD = {};
      let utmCG = {};

      for (let k in queryParams) {
        if (queryParams.hasOwnProperty(k)) {
          let v = queryParams[k];
          if (utmTestParams.indexOf(k) >= 0) {
            utmParams[k] = v;
          } else if (k.substring(0, 2) === 'cd') {
            utmCD[k.substring(2)] = v;
          } else if (k.substring(0, 2) === 'cm') {
            utmCM[k.substring(2)] = v;
          } else if (k.substring(0, 2) === 'cg') {
            utmCG[k.substring(2)] = v;
          }
        }
      }

      if (utmCM !== {}) {
        utmParams.utmCM = utmCM;
      }
      if (utmCD !== {}) {
        utmParams.utmCD = utmCD;
      }
      if (utmCG !== {}) {
        utmParams.utmCG = utmCG;
      }
      if (utmParams.utmpg) {
        utmParams.utmpg = utmParams.utmpg.split(',');
      }
    } else if (reqType === 'sitecatalyst') {
      utmParams.rsid = request.request.url.match(/(?:\/b\/ss\/([^/]+))(?=\/)/)[1];
      let scEvars = {};
      let scProps = {};
      const scTestParams = ['pageName', 'pe', 'events', 'products', 'pev2', 'pev1', 'purchaseID', 'zip', 'vid', 'xact', 'state', 'ch'];
      for (let k in queryParams) {
        if (queryParams.hasOwnProperty(k)) {
          let v = queryParams[k];
          if (scTestParams.indexOf(k) >= 0) {
            utmParams[k] = v;
          } else if (/v[0-9]{1,2}/i.test(k)) {
            scEvars[k.substring(1)] = v;
          } else if (/c[0-9]{1,2}/i.test(k)) {
            scProps[k.substring(1)] = v;
          }
        }
      }

      if (scEvars !== {}) {
        utmParams.scEvars = scEvars;
      }
      if (scProps !== {}) {
        utmParams.scProps = scProps;
      }
    }
    utmParams.__url = request.request.url;
    utmParams.__uuid = uuid();

    let tags = this.state.tags;
    tags[this.state.activeIndex].push(utmParams);
    this.setState({ tags });
  }

  messageListener = (message, sender, sendResponse) => {
    console.log(`${message.type} received: ${JSON.stringify(message)}`);

    if ((message.type === 'dataslayer_gtm') && (message.tabId === chrome.devtools.inspectedWindow.tabId)) {
      if (message.url !== 'iframe') {
        let urls = this.state.urls;
        urls[this.state.activeIndex] = message.url;
        this.setState({ urls });
      }

      if (message.data === 'notfound') {
        this.setState({ loading: false });
      } else if (message.data === 'found') {
        this.setState({ loading: false });

        let exists = false;

        if (this.state.GTMs[this.state.activeIndex].length > 0) {
          for (let i = 0; i < this.state.GTMs[this.state.activeIndex].length; i += 1) {
            if (this.state.GTMs[this.state.activeIndex][i].id === message.gtmID) {
              exists = true;
            }
          }
        }

        if (!exists) {
          let GTMs = this.state.GTMs;
          GTMs[this.state.activeIndex].push({
            id: message.gtmID,
            name: message.dLN,
            iframe: (message.url === 'iframe')
          });
          this.setState({ GTMs });
        }
      }
    } else if ((message.type === 'dataslayer_tlm') && (message.tabId === chrome.devtools.inspectedWindow.tabId)) {
      if (message.url !== 'iframe') {
        let urls = this.state.urls;
        urls[this.state.activeIndex] = message.url;
        this.setState({ urls });
      }

      if (message.data === 'notfound') {
        this.setState({ loading: false });
      } else if (message.data === 'found') {
        this.setState({ loading: false });

        let TLMs = this.state.TLMs;
        TLMs[this.state.activeIndex] = {
          id: message.gtmID,
          name: message.dLN,
          iframe: (message.url === 'iframe')
        };
        this.setState({ TLMs });
      } else {
        let utagDatas = this.state.utagDatas;
        utagDatas[this.state.activeIndex] = collapseUDO(JSON.parse(message.data));

        let TLMs = this.state.TLMs;
        TLMs[this.state.activeIndex] = {
          id: message.gtmID,
          name: message.dLN,
          iframe: (message.url === 'iframe')
        };

        this.setState({ utagDatas, TLMs });
      }
    } else if ((message.type === 'dataslayer_tco') && (message.tabId === chrome.devtools.inspectedWindow.tabId)) {
      console.log(message);
      if (message.url !== 'iframe') {
        let urls = this.state.urls;
        urls[this.state.activeIndex] = message.url;
        this.setState({ urls });
      }

      if (message.data === 'notfound') {
        this.setState({ loading: false });
      } else if (message.data === 'found') {
        let TCOs = this.state.TCOs;
        TCOs[this.state.activeIndex] = {
          id: message.gtmID,
          name: message.dLN,
          iframe: (message.url === 'iframe')
        };
        this.setState({ loading: false, TCOs });
      } else {
        let tcoDatas = this.state.tcoDatas;
        tcoDatas[this.state.activeIndex] = collapseUDO(JSON.parse(message.data));

        let TCOs = this.state.TCOs;
        TCOs[this.state.activeIndex] = {
          id: message.gtmID,
          name: message.dLN,
          iframe: (message.url === 'iframe')
        };

        this.setState({ TCOs, tcoDatas });
      }
    } else if ((message.type === 'dataslayer_dtm') && (message.tabId === chrome.devtools.inspectedWindow.tabId)) {
      console.log(message);
      if (message.url !== 'iframe') {
        let urls = this.state.urls;
        urls[this.state.activeIndex] = message.url;
        this.setState({ urls });
      }

      if (message.data === 'notfound') {
        this.setState({ loading: false });
      } else if (message.data === 'found') {
        let dtmDatas = this.state.dtmDatas;
        dtmDatas[this.state.activeIndex] = {
          loadRules: JSON.parse(message.loadRules),
          buildDate: message.buildDate,
          property: message.property,
          ...dtmDatas[this.state.activeIndex]
        };
        this.setState({ loading: false, dtmDatas });
      } else {
        let dtmDatas = this.state.dtmDatas;
        dtmDatas[this.state.activeIndex] = {
          loadRules: JSON.parse(message.loadRules),
          buildDate: message.buildDate,
          property: message.property,
          ...dtmDatas[this.state.activeIndex]
        };
        this.setState({ dtmDatas });
      }
    } else if ((message.type === 'dataslayer_launchdataelements') && (message.tabId === chrome.devtools.inspectedWindow.tabId)) {
      console.log(message);
      if (message.data === 'found') {
        let { dtmDatas } = this.state;
        let thisDTM = dtmDatas[this.state.activeIndex];
        if (typeof thisDTM !== 'undefined') {
          thisDTM.elements = message.elements;
        } else {
          dtmDatas[this.state.activeIndex] = {
            elements: message.elements
          };
        }
        this.setState({ dtmDatas });
      }
    } else if ((message.type === 'dataslayer_launchrulecompleted') && (message.tabId === chrome.devtools.inspectedWindow.tabId)) {
      console.log(message);
      let { dtmDatas } = this.state;
      let thisDTM = dtmDatas[this.state.activeIndex];
      if (typeof thisDTM !== 'undefined') {
        if (typeof thisDTM.rules !== 'object') {
          thisDTM.rules = [
            message.data
          ];
        } else {
          thisDTM.rules.push(message.data);
        }
      } else {
        dtmDatas[this.state.activeIndex] = {
          rules: [
            message.data
          ]
        };
      }
      this.setState({ dtmDatas });
    } else if ((message.type === 'dataslayer_var') && (message.tabId === chrome.devtools.inspectedWindow.tabId)) {
      let varDatas = this.state.varDatas;
      if (message.url !== 'iframe') {
        let urls = this.state.urls;
        urls[this.state.activeIndex] = message.url;
        this.setState({ urls });
      }

      if (message.data === 'found') {
        this.setState({ loading: false });

        let vars = this.state.vars;

        if (vars[this.state.activeIndex]) {
          vars[this.state.activeIndex].push({ name: message.dLN, iframe: (message.url === 'iframe') });
        } else {
          vars[this.state.activeIndex] = [{ name: message.dLN, iframe: (message.url === 'iframe') }];
        }
        this.setState({ vars });

        if (!varDatas[this.state.activeIndex]) {
          varDatas[this.state.activeIndex] = {};
        }
        varDatas[this.state.activeIndex][message.dLN] = {};
        this.setState({ varDatas });
      } else {
        varDatas[this.state.activeIndex][message.dLN] = collapseUDO(JSON.parse(message.data));
        this.setState({ varDatas });
      }
    }
    if ((message.type === 'dataslayer_gtm_push') && (message.tabId === chrome.devtools.inspectedWindow.tabId)) {
      if (message.url !== 'iframe') {
        let urls = this.state.urls;
        urls[this.state.activeIndex] = message.url;
        this.setState({ urls });
      }

      let datalayers = this.state.datalayers;
      if (datalayers[this.state.activeIndex].hasOwnProperty(message.dLN)) {
        datalayers[this.state.activeIndex][message.dLN].push(JSON.parse(message.data));
      } else {
        datalayers[this.state.activeIndex][message.dLN] = [JSON.parse(message.data)];
      }
      this.setState({ datalayers });
    } else if (message.type === 'dataslayer_loadsettings') {
      let options = this.state.options;
      for (let a in message.data) {
        if (message.data.hasOwnProperty(a)) {
          options[a] = message.data[a];
        }
      }
      this.setState({ options });
    } else if ((message.type === 'dataslayer_oncommitted') && (message.tabId === chrome.devtools.inspectedWindow.tabId)) {
      if (isFirefox()) {
        this.newPageLoad(message.url);
      }
    } else if ((message.type === 'dataslayer_adobetags') && (message.tabId === chrome.devtools.inspectedWindow.tabId)) {
      let tags = message.data;
      if (tags && tags.length) {
        for (let a in tags) {
          if (tags.hasOwnProperty(a)) {
            console.log('found existing tag');
            this.newRequest({
              request: { url: tags[a], method: 'GET' },
              response: { status: 200 },
            });
          }
        }
      }
    }
  }

  clearHistory = () => {
    this.setState({
      urls: [this.state.urls[this.state.activeIndex]],
      timestamps: [new Date().valueOf()],
      activeIndex: 0,
      datalayers: [{}],
      tags: [[]],
      utagDatas: [{}],
      tcoDatas: [{}],
      varDatas: [{}],
      dtmDatas: [{}],
      GTMs: [this.state.GTMs[this.state.activeIndex]],
      DTMs: [this.state.GTMs[this.state.activeIndex]],
      TLMs: [this.state.TLMs[this.state.activeIndex]],
      TCOs: [this.state.TCOs[this.state.activeIndex]],
      vars: [this.state.vars[this.state.activeIndex]]
    });
  }

  loadSettings = () => {
    let options = Object.assign({}, defaults);

    try {
      if (typeof localStorage.options !== 'undefined') {
        options = JSON.parse(localStorage.options);
      }
    } catch (error) {
      console.log(error);
    }

    let needOptionSave = false;

    for (let option of Object.keys(defaults)) {
      if (!options.hasOwnProperty(option)) {
        options[option] = defaults[option];
        needOptionSave = true;
      }
    }

    if (needOptionSave && isDevTools()) {
      chrome.storage.sync.set(options);
    }

    this.setState({ options });

    if (isDevTools()) {
      chrome.storage.sync.get(null, (items) => {
        options = items;

        for (let option of Object.keys(defaults)) {
          if (!options.hasOwnProperty(option)) {
            options[option] = defaults[option];
          }
        }

        try {
          localStorage.options = JSON.stringify(options);
        } catch (error) {
          console.log(error);
        }

        this.setState({ options });
      });
    }
  }

  render() {
    return (
      <div className={`App${this.state.darkTheme ? ' dark' : ''}`}>
        <GlobalHotKeys
          keyMap={{
            SEARCH: 'ctrl+alt+f',
          }}
          handlers={{
            SEARCH: () => this.setState({ searchMode: !this.state.searchMode, searchQuery: '' }),
          }}
        />
        { this.state.searchMode && !this.state.showOptions &&
          (<Search
            value={this.state.searchQuery}
            toggleSearch={() => this.setState({ searchMode: false, searchQuery: '' })}
            onChange={({ target: { value } }) => this.setState({ searchQuery: value.toLowerCase() })}
          />)
        }
        <Settings
          clearHistory={this.clearHistory}
          appState={this.state}
          handleFile={this.importFile}
          onSettingsClick={() => this.setState({ showOptions: !this.state.showOptions })}
          onSearchClick={() => this.setState({ searchMode: !this.state.searchMode, searchQuery: '' })}
        />
        <div>
          <div className="datalayeritems">
            { this.state.showOptions ? <Options options={this.state.options} setOption={this.setOption} /> : null}
            {!this.state.showOptions && (() => {
              let pages = [];
              for (let a = this.state.urls.length - 1; a >= 0; a--) {
                let pageData = {
                  DTM: this.state.DTMs[a] || null,
                  GTM: this.state.GTMs[a] || null,
                  TCO: this.state.TCOs[a] || null,
                  TLM: this.state.TLMs[a] || null,
                  datalayers: this.state.datalayers[a] || null,
                  dtmDatas: this.state.dtmDatas[a] || null,
                  tags: this.state.tags[a] || null,
                  tcoDatas: this.state.tcoDatas[a] || null,
                  utagDatas: this.state.utagDatas[a] || null,
                  varDatas: this.state.varDatas[a] || null,
                  vars: this.state.vars[a] || null
                };
                if (this.state.urls[a]) {
                  pages.push(
                    (<Page
                      key={`page${a}`}
                      ref={`page${a}`}
                      timestamp={this.state.timestamps[a] || null}
                      options={this.state.options}
                      url={this.state.urls[a]}
                      data={pageData}
                      index={a}
                      loading={this.state.loading}
                      isCurrent={a === (this.state.urls.length - 1)}
                      searchQuery={this.state.searchQuery}
                      searchMode={this.state.searchMode}
                    />)
                  );
                }
              }
              return pages;
            })()}
          </div>
        </div>
      </div>
    );
  }
}

export default Dataslayer;
