import { mount } from 'svelte';
import App from './App.svelte';
import ReminderCards from './lib/ReminderCards.svelte';
import './style.css';
import './appearance.css';
const reminderSurface=new URLSearchParams(location.search).get('surface')==='reminders';
if(reminderSurface)document.body.classList.add('reminder-surface');
mount(reminderSurface?ReminderCards:App, { target: document.getElementById('app')! });
