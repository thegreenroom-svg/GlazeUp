/* ═══════════════════════════════════════════════════════════════════
   KILN SCREEN — Modern Load Visualization & Status
   The heart of production: kiln loads, firing cycles, and piece progress.
   22 Jul 2026
   ═══════════════════════════════════════════════════════════════════ */

const KC_Kiln = {
  ready: false,
  
  init() {
    if (!window.DEMO_SKIN || this.ready) return;
    this.ready = true;
    
    const originalGoToTab = window.goToTab;
    if (originalGoToTab) {
      window.goToTab = (tab, ...args) => {
        if (tab === 'kiln') {
          const view = document.getElementById('kiln-view');
          if (view) view.style.display = 'block';
          const canvas = document.getElementById('kc-canvas');
          if (canvas) canvas.classList.add('kc-away');
          setTimeout(() => this.transform(), 100);
        }
        return originalGoToTab.call(window, tab, ...args);
      };
    }
  },
  
  transform() {
    const view = document.getElementById('kiln-view');
    if (!view || view.classList.contains('kc-kiln-modern')) return;
    view.classList.add('kc-kiln-modern');
    
    this.modernizeHeader(view);
    this.enhanceLoadCards(view);
    this.enhanceStatusIndicators(view);
    this.modernizeControls(view);
    this.addProgressVisuals(view);
  },
  
  modernizeHeader(view) {
    let header = view.querySelector('h2');
    if (!header) return;
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      margin: 0 0 16px 0;
      padding-bottom: 12px;
      border-bottom: 2px solid rgba(0, 122, 255, 0.2);
    `;
    
    const h2New = document.createElement('h2');
    h2New.textContent = 'The Kiln';
    h2New.style.cssText = `
      margin: 0;
      font-family: 'Inter', sans-serif;
      font-size: 32px;
      font-weight: 900;
      color: var(--m-accent);
      letter-spacing: -0.8px;
    `;
    
    const subtitle = document.createElement('div');
    subtitle.textContent = 'Loads, firings, and piece progress';
    subtitle.style.cssText = `
      font-size: 13px;
      color: #888;
      margin-top: 4px;
      font-weight: 500;
    `;
    
    wrapper.appendChild(h2New);
    wrapper.appendChild(subtitle);
    header.replaceWith(wrapper);
  },
  
  enhanceLoadCards(view) {
    // Enhance kiln load containers
    const loads = view.querySelectorAll('[class*="load"], [class*="batch"], [class*="firing"], .chart-container');
    loads.forEach(load => {
      if (load.classList.contains('kc-load-modern')) return;
      load.classList.add('kc-load-modern');
      
      load.style.cssText = `
        background: linear-gradient(135deg, var(--m-surface) 90%, rgba(255, 255, 255, 0.7)) !important;
        border: 1.5px solid rgba(0, 0, 0, 0.3) !important;
        border-radius: 14px !important;
        padding: 16px !important;
        margin-bottom: 14px !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05) !important;
        transition: all 0.3s ease !important;
      `;
      
      load.addEventListener('mouseenter', () => {
        load.style.borderColor = 'rgba(0, 122, 255, 0.4)';
        load.style.transform = 'translateY(-1px)';
        load.style.boxShadow = '0 6px 16px rgba(0, 122, 255, 0.12)';
      });
      
      load.addEventListener('mouseleave', () => {
        load.style.borderColor = 'rgba(0, 0, 0, 0.3)';
        load.style.transform = 'translateY(0)';
        load.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.05)';
      });
    });
  },
  
  enhanceStatusIndicators(view) {
    // Style status badges (firing, loaded, ready, etc.)
    const statuses = view.querySelectorAll('[class*="status"], [class*="badge"], [class*="indicator"]');
    statuses.forEach(status => {
      if (status.classList.contains('kc-status-enhanced')) return;
      status.classList.add('kc-status-enhanced');
      
      const text = status.textContent.toLowerCase();
      let bgColor = 'rgba(0, 122, 255, 0.1)';
      let textColor = 'var(--m-accent)';
      
      if (text.includes('active') || text.includes('firing') || text.includes('loading')) {
        bgColor = 'rgba(255, 152, 0, 0.15)';
        textColor = '#D97706';
      } else if (text.includes('ready') || text.includes('complete')) {
        bgColor = 'rgba(76, 175, 80, 0.15)';
        textColor = '#248A3D';
      } else if (text.includes('idle') || text.includes('empty')) {
        bgColor = 'rgba(158, 158, 158, 0.15)';
        textColor = '#424242';
      }
      
      status.style.cssText = `
        background: ${bgColor} !important;
        color: ${textColor} !important;
        border: 1px solid rgba(0, 122, 255, 0.2) !important;
        border-radius: 6px !important;
        padding: 6px 10px !important;
        font-weight: 600 !important;
        font-size: 12px !important;
        display: inline-block !important;
      `;
    });
  },
  
  modernizeControls(view) {
    // Action buttons (unload, start, etc.)
    const buttons = view.querySelectorAll('button, [role="button"]');
    buttons.forEach(btn => {
      if (btn.classList.contains('kc-kiln-control')) return;
      btn.classList.add('kc-kiln-control');
      
      const text = btn.textContent.toLowerCase();
      let bgGradient = 'linear-gradient(135deg, var(--m-accent), rgba(0, 122, 255, 0.9))';
      
      if (text.includes('unload') || text.includes('remove')) {
        bgGradient = 'linear-gradient(135deg, #D97706, rgba(217, 119, 6, 0.9))';
      } else if (text.includes('start') || text.includes('load')) {
        bgGradient = 'linear-gradient(135deg, #248A3D, rgba(36, 138, 61, 0.9))';
      }
      
      btn.style.cssText = `
        background: ${bgGradient} !important;
        color: var(--m-surface) !important;
        border: none !important;
        border-radius: 8px !important;
        padding: 10px 16px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
      `;
      
      btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'translateY(-2px)';
        btn.style.boxShadow = '0 8px 16px rgba(0, 122, 255, 0.2)';
      });
      
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = 'none';
      });
    });
  },
  
  addProgressVisuals(view) {
    // Enhance any progress bars or firing timers
    const progress = view.querySelectorAll('progress, [class*="progress"], [class*="temperature"]');
    progress.forEach(p => {
      if (p.classList && p.classList.contains('kc-progress-enhanced')) return;
      if (p.classList) p.classList.add('kc-progress-enhanced');
      
      p.style.cssText = `
        width: 100% !important;
        height: 8px !important;
        border-radius: 4px !important;
        background: rgba(0, 0, 0, 0.2) !important;
        overflow: hidden !important;
        margin: 8px 0 !important;
      `;
      
      if (p.tagName === 'PROGRESS') {
        p.style.accentColor = 'var(--m-accent)';
      }
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => KC_Kiln.init());
} else {
  KC_Kiln.init();
}
