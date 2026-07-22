/* ═══════════════════════════════════════════════════════════════════
   FLOOR PLAN SCREEN — Modern Table Layout Rebuild
   The studio's heart: live table bookings, seat status, and flow.
   22 Jul 2026
   ═══════════════════════════════════════════════════════════════════ */

const KC_Floor = {
  ready: false,
  
  init() {
    if (!window.DEMO_SKIN || this.ready) return;
    this.ready = true;
    
    const originalGoToTab = window.goToTab;
    if (originalGoToTab) {
      window.goToTab = (tab, ...args) => {
        if (tab === 'floor' || tab === 'floor-plan') {
          const view = document.getElementById('floor-plan-view');
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
    const view = document.getElementById('floor-plan-view');
    if (!view || view.classList.contains('kc-floor-modern')) return;
    view.classList.add('kc-floor-modern');
    
    // Modernize header
    this.modernizeHeader(view);
    
    // Style chart containers (the actual floor plan SVG)
    this.enhanceChartContainers(view);
    
    // Enhance table/space listings
    this.enhanceTableSections(view);
    
    // Add modern controls
    this.modernizeControls(view);
  },
  
  modernizeHeader(view) {
    let header = view.querySelector('h2');
    if (!header) return;
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      margin: 0 0 8px 0;
      padding-bottom: 12px;
      border-bottom: 2px solid rgba(0, 122, 255, 0.2);
    `;
    
    const h2New = document.createElement('h2');
    h2New.textContent = 'The Floor';
    h2New.style.cssText = `
      margin: 0;
      font-family: 'Inter', sans-serif;
      font-size: 32px;
      font-weight: 900;
      color: var(--m-accent);
      letter-spacing: -0.8px;
    `;
    
    const subtitle = document.createElement('div');
    subtitle.textContent = 'Bookings, seating, and studio flow';
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
  
  enhanceChartContainers(view) {
    const containers = view.querySelectorAll('.chart-container, svg');
    containers.forEach(container => {
      if (container.classList && container.classList.contains('kc-chart-enhanced')) return;
      if (container.classList) container.classList.add('kc-chart-enhanced');
      
      container.style.cssText = `
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.5)) !important;
        border: 2px solid rgba(0, 122, 255, 0.2) !important;
        border-radius: 16px !important;
        padding: 16px !important;
        margin-bottom: 20px !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
      `;
    });
  },
  
  enhanceTableSections(view) {
    const sections = view.querySelectorAll('[class*="section"], [class*="group"], table');
    sections.forEach(section => {
      if (section.classList && section.classList.contains('kc-table-section')) return;
      if (section.classList) section.classList.add('kc-table-section');
      
      // Style table rows
      if (section.tagName === 'TABLE') {
        section.style.cssText = `
          width: 100% !important;
          border-collapse: collapse !important;
          background: var(--m-surface) !important;
          border-radius: 8px !important;
          overflow: hidden !important;
        `;
        
        section.querySelectorAll('tr').forEach((row, idx) => {
          if (idx === 0) {
            row.style.cssText = `
              background: linear-gradient(135deg, var(--m-accent), var(--m-accent)) !important;
              color: var(--m-surface) !important;
            `;
            row.querySelectorAll('th, td').forEach(cell => {
              cell.style.cssText = `
                padding: 12px !important;
                font-family: 'Inter', sans-serif !important;
                font-weight: 700 !important;
              `;
            });
          } else {
            row.style.cssText = `
              border-bottom: 1px solid rgba(0, 122, 255, 0.1) !important;
              transition: all 0.2s ease !important;
            `;
            row.addEventListener('mouseenter', () => {
              row.style.backgroundColor = 'rgba(0, 122, 255, 0.05)';
            });
            row.addEventListener('mouseleave', () => {
              row.style.backgroundColor = '';
            });
          }
        });
      }
    });
  },
  
  modernizeControls(view) {
    const buttons = view.querySelectorAll('button, [role="button"]');
    buttons.forEach(btn => {
      if (btn.classList.contains('kc-control-modern')) return;
      btn.classList.add('kc-control-modern');
      
      btn.style.cssText = `
        background: linear-gradient(135deg, var(--m-accent), rgba(0, 122, 255, 0.9)) !important;
        color: var(--m-surface) !important;
        border: 1.5px solid var(--m-accent) !important;
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
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => KC_Floor.init());
} else {
  KC_Floor.init();
}
