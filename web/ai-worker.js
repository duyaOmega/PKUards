import { chooseAction } from './ai.js?v=1.6.0';

self.onmessage = ({ data }) => {
  self.postMessage({ id: data.id, action: chooseAction(data.view, data.actions) });
};
