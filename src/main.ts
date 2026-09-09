import { App } from './core/App';
import './styles.css';
import './ui/gaze.css';

const container = document.querySelector<HTMLElement>('#app');

if (!container) {
  throw new Error('Missing #app container.');
}

const app = new App(container);
app.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => app.dispose());
}
