import { chooseAction } from './ai.js?v=1.3.5';

self.onmessage = ({ data }) => {
  self.postMessage({ id: data.id, action: chooseAction(data.view, data.actions) });
};
