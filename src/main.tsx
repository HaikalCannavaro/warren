import { createRoot } from "react-dom/client";
import MissionControl from "./mission-control/MissionControl";
import "@xterm/xterm/css/xterm.css";
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import "./styles.css";
import './mobile-theme.css';

createRoot(document.getElementById("root")!).render(<MissionControl />);
