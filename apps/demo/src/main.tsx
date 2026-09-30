import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MechanismValidationError, parseMechanism } from '@molecular-motion/core';
import { MolecularMechanism } from '@molecular-motion/react';
import parpSource from '../../../examples/parp1-ssb-repair.yaml?raw';
import hrSource from '../../../examples/homologous-recombination.yaml?raw';
import './styles.css';

const examples = { 'PARP1 / SSB repair': parpSource, 'Homologous recombination': hrSource };

function App() {
  const [source, setSource] = useState(parpSource);
  const [active, setActive] = useState(Object.keys(examples)[0]!);
  const result = useMemo(() => {
    try { return { definition: parseMechanism(source), error: null }; }
    catch (error) {
      const message = error instanceof MechanismValidationError ? error.issues.join('\n') : String(error);
      return { definition: null, error: message };
    }
  }, [source]);

  const selectExample = (name: keyof typeof examples) => {
    setActive(name);
    setSource(examples[name]);
  };

  return <main>
    <header className="hero">
      <a className="wordmark" href="https://github.com/alvaroesteban/molecular-motion">Molecular<span>Motion</span></a>
      <div className="hero__copy">
        <p className="eyebrow">Declarative molecular visualization</p>
        <h1>Describe the biology.<br/><em>Let it move.</em></h1>
        <p>Write actors, steps and actions as YAML. Molecular Motion turns them into an interactive, accessible SVG mechanism.</p>
      </div>
      <div className="hero__meta"><span>Schema v2</span><span>SVG</span><span>React</span></div>
    </header>

    <section className="workspace" aria-label="Molecular Motion playground">
      <div className="workspace__heading">
        <div><p className="eyebrow">Live playground</p><h2>Definition → mechanism</h2></div>
        <div className="tabs" role="group" aria-label="Examples">
          {(Object.keys(examples) as (keyof typeof examples)[]).map(name => <button key={name} className={active === name ? 'active' : ''} onClick={() => selectExample(name)}>{name}</button>)}
        </div>
      </div>
      <div className="workspace__grid">
        <label className="editor">
          <span><b>mechanism.yaml</b><i className={result.error ? 'invalid' : ''}>{result.error ? 'Invalid' : 'Valid'}</i></span>
          <textarea value={source} onChange={event => setSource(event.target.value)} spellCheck="false" aria-invalid={Boolean(result.error)} />
        </label>
        <div className="preview">
          {result.definition
            ? <MolecularMechanism definition={result.definition} />
            : <pre className="error" role="alert">{result.error}</pre>}
        </div>
      </div>
    </section>

    <footer className="site-footer"><span>MIT licensed</span><span>Built for researchers, educators and scientific developers.</span></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
