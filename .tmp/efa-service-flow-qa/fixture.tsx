import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WorkflowShell} from '../../../src/components/WorkflowShell';
import {WorkflowHeader} from '../../../src/components/WorkflowHeader';
import {EfaEpisodeWorkspace} from '../../../src/components/EfaEpisodeWorkspace';
import '../../../src/styles.css';
function Fixture(){const [section,setSection]=useState('communications');const [expanded,setExpanded]=useState(false);return <WorkflowShell header={<WorkflowHeader eyebrow="Fixture" title="Service QA" description="Local viewport fixture" accountSlot={<button onClick={()=>setExpanded(!expanded)}>Resize header</button>} accountDetails={expanded?<div style={{height:140}}>Expanded account details</div>:null}/> }><EfaEpisodeWorkspace episodeLabel="QA" activeSection={section} onSelectSection={setSection}><p>Active: {section}</p><div style={{height:2400}}>Tall local call fixture</div></EfaEpisodeWorkspace></WorkflowShell>};
createRoot(document.getElementById('root')!).render(<Fixture/>);
