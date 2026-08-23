import "@angular/compiler";
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app.component";
import "./styles.css";

bootstrapApplication(AppComponent).catch((error: unknown) => console.error(error));
