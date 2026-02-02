    let cy = null;

    // Toast notifications
    function toast(message, type = 'info', duration = 3000) {
      const container = document.getElementById('toast-container');
      const t = document.createElement('div');
      t.className = `toast ${type}`;
      t.textContent = message;
      container.appendChild(t);
      
      setTimeout(() => {
        t.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => t.remove(), 300);
      }, duration);
    }

    // Theme toggle
    function toggleTheme() {
      document.body.classList.toggle('light-theme');
      const btn = document.querySelector('.theme-toggle');
      const isLight = document.body.classList.contains('light-theme');
      btn.textContent = isLight ? '☀️' : '🌙';
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
      
      // Update Cytoscape node label colors
      if (cy) {
        cy.style().selector('node').style('color', isLight ? '#333' : '#ccc').update();
      }
    }

    // Restore theme from localStorage
    if (localStorage.getItem('theme') === 'light') {
      document.body.classList.add('light-theme');
      document.querySelector('.theme-toggle').textContent = '☀️';
    }

    // Node colors by type
    const typeColors = {
      task: '#e94560',
      doc: '#4ecdc4',
      code: '#ffe66d',
      decision: '#95e1d3',
      ideation: '#f38181',
      brainfart: '#aa96da',
      research: '#fcbad3',
      conversation: '#a8d8ea',
      concept: '#f9ed69',
      event: '#b8de6f',
      agent: '#ff9a3c',
      project: '#6a89cc',
    };

    // Initialize Cytoscape
    function initCytoscape() {
      cy = cytoscape({
        container: document.getElementById('cy'),
        style: [
          {
            selector: 'node',
            style: {
              'label': 'data(label)',
              'text-valign': 'bottom',
              'text-halign': 'center',
              'font-size': '10px',
              'color': '#ccc',
              'text-margin-y': 5,
              'width': 30,
              'height': 30,
              'background-color': '#666',
              'border-width': 2,
              'border-color': '#444',
              'text-max-width': '100px',
              'text-wrap': 'ellipsis',
              'text-overflow-wrap': 'anywhere',
            }
          },
          {
            selector: 'edge',
            style: {
              'width': 2,
              'line-color': '#444',
              'target-arrow-color': '#444',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'arrow-scale': 0.8,
              'label': 'data(type)',
              'font-size': '9px',
              'color': '#666',
              'text-opacity': 0,
              'text-rotation': 'autorotate',
              'text-margin-y': -8,
            }
          },
          {
            selector: 'edge:active, edge.hover',
            style: {
              'text-opacity': 1,
              'color': '#aaa',
            }
          },
          {
            selector: 'node:selected',
            style: {
              'border-width': 4,
              'border-color': '#fff',
            }
          },
          // Type-specific colors
          ...Object.entries(typeColors).map(([type, color]) => ({
            selector: `node.${type}`,
            style: { 'background-color': color }
          })),
          // Priority styles (indicator dot)
          {
            selector: 'node.critical',
            style: {
              'border-width': 4,
              'border-color': '#ff0000',
            }
          },
          {
            selector: 'node.high',
            style: {
              'border-width': 3,
              'border-color': '#ff6b6b',
            }
          },
          // Status styles
          {
            selector: 'node.complete',
            style: { 
              'opacity': 0.7,
              'border-color': '#4ecdc4',
              'border-width': 3
            }
          },
          {
            selector: 'node.blocked',
            style: { 
              'border-style': 'dashed',
              'border-color': '#e94560'
            }
          },
          {
            selector: 'node.active',
            style: {
              'border-color': '#ffe66d',
              'border-width': 3
            }
          },
          // Edge type colors
          {
            selector: 'edge.blocks, edge.blocked-by',
            style: { 'line-color': '#e94560', 'target-arrow-color': '#e94560' }
          },
          {
            selector: 'edge.depends-on',
            style: { 'line-color': '#ffe66d', 'target-arrow-color': '#ffe66d' }
          },
          {
            selector: 'edge.implements',
            style: { 'line-color': '#4ecdc4', 'target-arrow-color': '#4ecdc4' }
          },
          // Starred nodes
          {
            selector: 'node.starred',
            style: {
              'background-image': 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\'%3E%3Cpath fill=\'gold\' d=\'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z\'/%3E%3C/svg%3E")',
              'background-width': '16px',
              'background-height': '16px',
              'background-position-x': '100%',
              'background-position-y': '0%',
            }
          },
          // Drag-link source
          {
            selector: 'node.drag-link-source',
            style: {
              'border-width': 4,
              'border-color': '#00ff00',
              'border-style': 'dashed',
              'overlay-color': '#00ff00',
              'overlay-opacity': 0.2,
            }
          },
          // Multi-select
          {
            selector: 'node.selected-multi',
            style: {
              'border-width': 4,
              'border-color': '#ffd700',
              'border-style': 'double',
            }
          },
          // Hover states
          {
            selector: '.dimmed',
            style: { 'opacity': 0.15 }
          },
          {
            selector: 'node.highlighted',
            style: { 
              'border-width': 4,
              'border-color': '#fff',
              'z-index': 999,
              'text-max-width': '200px',
              'font-size': '12px',
            }
          },
        ],
        layout: {
          name: 'cose',
          animate: false,
          nodeRepulsion: 8000,
          idealEdgeLength: 100,
        },
      });

      // Click handler (with multi-select)
      cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        const nodeId = node.id();
        
        if (evt.originalEvent.shiftKey) {
          // Multi-select with shift
          node.toggleClass('selected-multi');
          updateSelectionCount();
        } else {
          // Single select
          cy.nodes().removeClass('selected-multi');
          showNodeDetail(nodeId);
          updateSelectionCount();
        }
      });

      // Drag-to-link: hold Alt and drag from one node to another
      let dragLinkSource = null;
      let dragLine = null;

      cy.on('grab', 'node', (evt) => {
        if (evt.originalEvent.altKey) {
          dragLinkSource = evt.target;
          evt.target.ungrabify(); // Prevent actual drag
          // Visual feedback
          dragLinkSource.addClass('drag-link-source');
        }
      });

      cy.on('mousemove', (evt) => {
        if (dragLinkSource && evt.position) {
          // Could add a visual line here in future
        }
      });

      cy.on('tap', 'node', (evt) => {
        if (dragLinkSource && evt.target !== dragLinkSource) {
          // Complete the link
          const from = dragLinkSource.id();
          const to = evt.target.id();
          dragLinkSource.removeClass('drag-link-source');
          dragLinkSource.grabify();
          dragLinkSource = null;
          
          // Show edge type picker
          showQuickLinkModal(from, to);
        }
      });

      cy.on('tap', (evt) => {
        // Cancel drag-link if clicking on background
        if (evt.target === cy && dragLinkSource) {
          dragLinkSource.removeClass('drag-link-source');
          dragLinkSource.grabify();
          dragLinkSource = null;
        }
      });

      // Double-click to edit
      cy.on('dbltap', 'node', (evt) => {
        currentNodeId = evt.target.id();
        editCurrentNode();
      });

      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          closeDetail();
        }
      });

      // Right-click context menu
      cy.on('cxttap', 'node', (evt) => {
        const node = evt.target;
        currentNodeId = node.id();
        
        const menu = document.getElementById('context-menu');
        const pos = evt.renderedPosition;
        const container = document.querySelector('.graph-container').getBoundingClientRect();
        
        menu.style.left = (container.left + pos.x) + 'px';
        menu.style.top = (container.top + pos.y) + 'px';
        menu.classList.add('visible');
        
        evt.originalEvent.preventDefault();
      });

      // Hide context menu on click elsewhere
      document.addEventListener('click', () => {
        document.getElementById('context-menu').classList.remove('visible');
      });

      // Hover highlight for connected nodes
      cy.on('mouseover', 'node', (evt) => {
        const node = evt.target;
        const connected = node.neighborhood().add(node);
        
        cy.elements().addClass('dimmed');
        connected.removeClass('dimmed');
        node.addClass('highlighted');
        
        // Show edge labels for connected edges
        node.connectedEdges().addClass('hover');
      });

      cy.on('mouseout', 'node', () => {
        cy.elements().removeClass('dimmed').removeClass('highlighted');
        cy.edges().removeClass('hover');
      });

      // Edge hover for label
      cy.on('mouseover', 'edge', (evt) => {
        evt.target.addClass('hover');
      });

      cy.on('mouseout', 'edge', (evt) => {
        evt.target.removeClass('hover');
      });
    }

    // Load graph data
    async function loadGraph() {
      document.getElementById('loading').style.display = 'block';
      
      // Show skeleton stats
      document.getElementById('stat-nodes').innerHTML = '<span class="skeleton" style="width:30px;height:24px;display:inline-block"></span>';
      document.getElementById('stat-edges').innerHTML = '<span class="skeleton" style="width:30px;height:24px;display:inline-block"></span>';

      const params = new URLSearchParams();
      
      // Use active types from chips
      if (activeTypes.size > 0) {
        params.set('type', Array.from(activeTypes).join(','));
      }
      
      const status = document.getElementById('filter-status').value;
      if (status) params.set('status', status);
      
      const validity = document.getElementById('filter-validity').value;
      if (validity) params.set('validity', validity);
      
      const search = document.getElementById('filter-search').value;
      if (search) params.set('search', search);

      try {
        const res = await fetch(`/api/graph?${params}`);
        let data = await res.json();

        // Apply time filter client-side
        const timeFilter = document.getElementById('filter-time').value;
        if (timeFilter && data.nodes.length > 0) {
          const now = new Date();
          let cutoff;
          switch (timeFilter) {
            case 'today':
              cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              break;
            case 'week':
              cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              break;
            case 'month':
              cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              break;
          }
          if (cutoff) {
            const cutoffTime = cutoff.getTime();
            data.nodes = data.nodes.filter(n => {
              const created = n.data.created_at ? new Date(n.data.created_at).getTime() : 0;
              return created >= cutoffTime;
            });
            const nodeIds = new Set(data.nodes.map(n => n.data.id));
            data.edges = data.edges.filter(e => 
              nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
            );
          }
        }

        // Apply starred filter
        if (document.getElementById('filter-starred').checked) {
          data.nodes = data.nodes.filter(n => starredNodes.has(n.data.id));
          const nodeIds = new Set(data.nodes.map(n => n.data.id));
          data.edges = data.edges.filter(e => 
            nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
          );
        }

        // Add starred class to starred nodes
        data.nodes.forEach(n => {
          if (starredNodes.has(n.data.id)) {
            n.classes = (n.classes || []).concat('starred');
          }
        });

        cy.elements().remove();
        cy.add(data.nodes);
        cy.add(data.edges);

        cy.layout({
          name: 'cose',
          animate: true,
          animationDuration: 500,
          nodeRepulsion: 8000,
          idealEdgeLength: 100,
        }).run();

        document.getElementById('stat-nodes').textContent = data.nodes.length;
        document.getElementById('stat-edges').textContent = data.edges.length;

        // Show/hide empty state
        if (data.nodes.length === 0) {
          document.getElementById('empty-state').classList.add('visible');
        } else {
          document.getElementById('empty-state').classList.remove('visible');
        }
        
        // Update minimap after layout settles
        setTimeout(updateMinimap, 600);
        
        // Update URL with filter state
        updateURL();
      } catch (err) {
        console.error('Failed to load graph:', err);
      } finally {
        document.getElementById('loading').style.display = 'none';
      }
    }

    // Show node details
    async function showNodeDetail(nodeId) {
      currentNodeId = nodeId;
      try {
        const res = await fetch(`/api/node?id=${encodeURIComponent(nodeId)}`);
        const data = await res.json();
        const node = data.node;

        document.getElementById('detail-title').innerHTML = `
          ${node.title}
          <button class="copy-id-btn" onclick="copyNodeId()" title="Copy ID">📎</button>
        `;
        
        document.getElementById('detail-meta').innerHTML = `
          <div class="meta-item">
            <div class="meta-label">Type</div>
            <div class="meta-value">${node.type}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Status</div>
            <div class="meta-value">${node.status}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Priority</div>
            <div class="meta-value">${node.priority}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Validity</div>
            <div class="meta-value">${node.validity}</div>
          </div>
        `;

        document.getElementById('detail-tags').innerHTML = node.tags.length 
          ? node.tags.map(t => `<span class="tag">${t}</span>`).join('')
          : '<span style="color:#666">No tags</span>';

        if (node.edges.length > 0) {
          document.getElementById('detail-edges').innerHTML = `
            <h4 style="font-size:12px;color:#888;margin-bottom:8px">RELATIONSHIPS</h4>
            ${node.edges.map(e => `
              <div class="edge-item">
                <span>this</span>
                <span class="edge-type">→ ${e.type} →</span>
                <span>${e.to.split('/').pop()}</span>
                <button class="edge-delete" onclick="deleteEdge('${node.id}', '${e.type}', '${e.to}')" title="Remove">×</button>
              </div>
            `).join('')}
          `;
        } else {
          document.getElementById('detail-edges').innerHTML = '';
        }

        document.getElementById('detail-body').textContent = node.content || '(no content)';

        document.getElementById('detail-panel').classList.add('active');
        updateStarButton();
        addToRecent(nodeId, node.title);
      } catch (err) {
        console.error('Failed to load node:', err);
      }
    }

    // Close detail panel
    function closeDetail() {
      document.getElementById('detail-panel').classList.remove('active');
      currentNodeId = null;
    }

    // Reset filters
    function resetFilters() {
      toggleAllTypes(); // Reset type chips
      document.getElementById('filter-status').value = '';
      document.getElementById('filter-validity').value = '';
      document.getElementById('filter-search').value = '';
      loadGraph();
    }

    // Active type filters (empty = all)
    let activeTypes = new Set();

    // Load type options as chips with counts
    async function loadTypes() {
      const container = document.getElementById('type-chips');
      
      // Show skeleton
      container.innerHTML = Array(6).fill('<span class="skeleton skeleton-chip"></span>').join('');
      
      try {
        // Fetch types and stats in parallel
        const [typesRes, statsRes] = await Promise.all([
          fetch('/api/types'),
          fetch('/api/stats')
        ]);
        const typesData = await typesRes.json();
        const statsData = await statsRes.json();
        
        // Build count map
        const counts = {};
        if (statsData.byType) {
          Object.entries(statsData.byType).forEach(([type, count]) => {
            counts[type] = count;
          });
        }
        
        container.innerHTML = `
          <span class="type-chip all-types active" onclick="toggleAllTypes()">All</span>
          ${typesData.types.map(t => `
            <span class="type-chip type-${t}" onclick="toggleTypeChip('${t}')" data-type="${t}">${t}${counts[t] ? ` (${counts[t]})` : ''}</span>
          `).join('')}
        `;
      } catch (err) {
        console.error('Failed to load types:', err);
        container.innerHTML = '<span style="color:#888">Failed to load</span>';
      }
    }

    // Toggle a specific type chip
    function toggleTypeChip(type) {
      const chip = document.querySelector(`.type-chip[data-type="${type}"]`);
      const allChip = document.querySelector('.type-chip.all-types');
      
      if (activeTypes.has(type)) {
        activeTypes.delete(type);
        chip.classList.remove('active');
      } else {
        activeTypes.add(type);
        chip.classList.add('active');
      }

      // Update "All" chip state
      if (activeTypes.size === 0) {
        allChip.classList.add('active');
      } else {
        allChip.classList.remove('active');
      }

      // Auto-apply filter
      loadGraph();
    }

    // Toggle all types (clear selection)
    function toggleAllTypes() {
      activeTypes.clear();
      document.querySelectorAll('.type-chip').forEach(c => c.classList.remove('active'));
      document.querySelector('.type-chip.all-types').classList.add('active');
      loadGraph();
    }

    // Layout change
    function changeLayout() {
      const layoutName = document.getElementById('layout-select').value;
      const layoutOptions = {
        cose: {
          name: 'cose',
          animate: true,
          animationDuration: 500,
          nodeRepulsion: 8000,
          idealEdgeLength: 100,
        },
        circle: {
          name: 'circle',
          animate: true,
          animationDuration: 500,
        },
        grid: {
          name: 'grid',
          animate: true,
          animationDuration: 500,
          rows: Math.ceil(Math.sqrt(cy.nodes().length)),
        },
        breadthfirst: {
          name: 'breadthfirst',
          animate: true,
          animationDuration: 500,
          directed: true,
          spacingFactor: 1.5,
        },
        concentric: {
          name: 'concentric',
          animate: true,
          animationDuration: 500,
          concentric: node => node.degree(),
          levelWidth: () => 2,
        },
      };

      cy.layout(layoutOptions[layoutName] || layoutOptions.cose).run();
      setTimeout(updateMinimap, 600);
    }

    // Zoom functions
    function zoomIn() {
      cy.zoom(cy.zoom() * 1.2);
      cy.center();
    }

    function zoomOut() {
      cy.zoom(cy.zoom() / 1.2);
      cy.center();
    }

    function fitGraph() {
      cy.fit(cy.elements(), 50);
    }

    function toggleFullscreen() {
      document.querySelector('.container').classList.toggle('fullscreen');
      const btn = document.getElementById('fullscreen-btn');
      const isFullscreen = document.querySelector('.container').classList.contains('fullscreen');
      btn.textContent = isFullscreen ? '⊞' : '⛶';
      btn.title = isFullscreen ? 'Exit Fullscreen (f)' : 'Fullscreen (f)';
      
      // Resize cytoscape after transition
      setTimeout(() => {
        if (cy) {
          cy.resize();
          cy.fit(50);
        }
      }, 100);
    }

    // Toggle shortcuts help
    function toggleHelp() {
      document.getElementById('shortcuts-help').classList.toggle('visible');
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Don't trigger if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
        }
        return;
      }

      switch (e.key) {
        case '/':
          e.preventDefault();
          document.getElementById('filter-search').focus();
          break;
        case '+':
        case '=':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
        case '0':
          e.preventDefault();
          fitGraph();
          break;
        case 'Escape':
          closeDetail();
          break;
        case '?':
          e.preventDefault();
          toggleHelp();
          break;
        case 'r':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            loadGraph();
          }
          break;
        case 'n':
          e.preventDefault();
          showCreateModal();
          break;
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            history.undo();
          }
          break;
        case 'y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            history.redo();
          }
          break;
        case 'ArrowDown':
        case 'ArrowUp':
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'j':
        case 'k':
          if (!isInputFocused()) {
            e.preventDefault();
            navigateNodes(e.key);
          }
          break;
        case 'Enter':
          if (!isInputFocused() && currentNodeId) {
            e.preventDefault();
            editCurrentNode();
          }
          break;
        case 'f':
          if (!isInputFocused()) {
            e.preventDefault();
            toggleFullscreen();
          }
          break;
      }
    });

    // Check if an input element is focused
    function isInputFocused() {
      const el = document.activeElement;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
    }

    // Navigate between nodes with arrow keys
    function navigateNodes(key) {
      const nodes = cy.nodes().sort((a, b) => {
        const posA = a.position();
        const posB = b.position();
        return posA.y - posB.y || posA.x - posB.x;
      });
      
      if (nodes.length === 0) return;
      
      let currentIndex = -1;
      if (currentNodeId) {
        currentIndex = nodes.findIndex(n => n.id() === currentNodeId);
      }
      
      let nextIndex;
      switch (key) {
        case 'ArrowDown':
        case 'j':
          nextIndex = currentIndex < nodes.length - 1 ? currentIndex + 1 : 0;
          break;
        case 'ArrowUp':
        case 'k':
          nextIndex = currentIndex > 0 ? currentIndex - 1 : nodes.length - 1;
          break;
        case 'ArrowRight':
          nextIndex = currentIndex < nodes.length - 1 ? currentIndex + 1 : 0;
          break;
        case 'ArrowLeft':
          nextIndex = currentIndex > 0 ? currentIndex - 1 : nodes.length - 1;
          break;
        default:
          return;
      }
      
      const nextNode = nodes[nextIndex];
      showNodeDetail(nextNode.id());
      cy.animate({ center: { eles: nextNode }, duration: 200 });
    }

    // Current node being viewed (for edit/delete)
    let currentNodeId = null;

    // Starred nodes (stored in localStorage)
    let starredNodes = new Set(JSON.parse(localStorage.getItem('starredNodes') || '[]'));

    // Recent nodes (stored in localStorage)
    let recentNodes = JSON.parse(localStorage.getItem('recentNodes') || '[]');
    const MAX_RECENT = 10;

    function addToRecent(nodeId, title) {
      // Remove if already exists
      recentNodes = recentNodes.filter(n => n.id !== nodeId);
      // Add to front
      recentNodes.unshift({ id: nodeId, title, time: Date.now() });
      // Trim to max
      recentNodes = recentNodes.slice(0, MAX_RECENT);
      // Save
      localStorage.setItem('recentNodes', JSON.stringify(recentNodes));
      updateRecentList();
    }

    function updateRecentList() {
      const container = document.getElementById('recent-nodes');
      if (!container) return;
      
      if (recentNodes.length === 0) {
        container.innerHTML = '<span style="color:#666;font-size:12px">No recent nodes</span>';
        return;
      }
      
      container.innerHTML = '';
      recentNodes.forEach(n => {
        const div = document.createElement('div');
        div.className = 'recent-item';
        div.title = n.id;
        div.textContent = n.title.substring(0, 25) + (n.title.length > 25 ? '...' : '');
        div.onclick = () => showNodeDetail(n.id);
        container.appendChild(div);
      });
    }

    function toggleStar() {
      if (!currentNodeId) return;
      
      if (starredNodes.has(currentNodeId)) {
        starredNodes.delete(currentNodeId);
        toast('Unstarred', 'info');
      } else {
        starredNodes.add(currentNodeId);
        toast('Starred ⭐', 'success');
      }
      
      localStorage.setItem('starredNodes', JSON.stringify([...starredNodes]));
      updateStarButton();
      
      // Update node visual
      const node = cy.getElementById(currentNodeId);
      if (node) {
        if (starredNodes.has(currentNodeId)) {
          node.addClass('starred');
        } else {
          node.removeClass('starred');
        }
      }
    }

    function updateStarButton() {
      const btn = document.getElementById('star-btn');
      if (btn && currentNodeId) {
        btn.textContent = starredNodes.has(currentNodeId) ? '⭐ Unstar' : '☆ Star';
      }
    }

    function copyNodeId() {
      if (!currentNodeId) return;
      navigator.clipboard.writeText(currentNodeId).then(() => {
        toast('Copied: ' + currentNodeId, 'info', 2000);
      }).catch(err => {
        toast('Failed to copy', 'error');
      });
    }

    // Focus mode - show only the selected node and its neighbors
    let focusMode = false;
    let hiddenElements = [];

    function focusOnNode() {
      if (!currentNodeId || !cy) return;
      
      const node = cy.getElementById(currentNodeId);
      if (!node) return;

      if (focusMode) {
        // Exit focus mode - restore hidden elements
        hiddenElements.forEach(el => el.style('display', 'element'));
        hiddenElements = [];
        focusMode = false;
        toast('Focus mode off', 'info', 1500);
      } else {
        // Enter focus mode - hide unconnected nodes
        const connected = node.neighborhood().add(node);
        const toHide = cy.elements().not(connected);
        toHide.forEach(el => {
          el.style('display', 'none');
          hiddenElements.push(el);
        });
        focusMode = true;
        cy.fit(connected, 50);
        toast('Focus mode: showing connected nodes only', 'info');
      }
    }

    // Undo/redo history
    const history = {
      past: [],
      future: [],
      maxSize: 50,
      
      push(action) {
        this.past.push(action);
        this.future = []; // Clear redo stack on new action
        if (this.past.length > this.maxSize) this.past.shift();
        this.updateButtons();
      },
      
      canUndo() { return this.past.length > 0; },
      canRedo() { return this.future.length > 0; },
      
      async undo() {
        if (!this.canUndo()) return;
        const action = this.past.pop();
        this.future.push(action);
        await this.revert(action);
        this.updateButtons();
      },
      
      async redo() {
        if (!this.canRedo()) return;
        const action = this.future.pop();
        this.past.push(action);
        await this.apply(action);
        this.updateButtons();
      },
      
      async revert(action) {
        try {
          switch (action.type) {
            case 'create':
              await fetch(`/api/node?id=${encodeURIComponent(action.nodeId)}`, { method: 'DELETE' });
              break;
            case 'delete':
              await fetch('/api/node', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action.data)
              });
              break;
            case 'update':
              await fetch('/api/node', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: action.nodeId, ...action.oldData })
              });
              break;
            case 'link':
              await fetch('/api/edge', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action.edge)
              });
              break;
            case 'unlink':
              await fetch('/api/edge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action.edge)
              });
              break;
          }
          loadGraph();
        } catch (err) {
          console.error('Undo failed:', err);
        }
      },
      
      async apply(action) {
        try {
          switch (action.type) {
            case 'create':
              await fetch('/api/node', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action.data)
              });
              break;
            case 'delete':
              await fetch(`/api/node?id=${encodeURIComponent(action.nodeId)}`, { method: 'DELETE' });
              break;
            case 'update':
              await fetch('/api/node', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: action.nodeId, ...action.newData })
              });
              break;
            case 'link':
              await fetch('/api/edge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action.edge)
              });
              break;
            case 'unlink':
              await fetch('/api/edge', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action.edge)
              });
              break;
          }
          loadGraph();
        } catch (err) {
          console.error('Redo failed:', err);
        }
      },
      
      updateButtons() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        if (undoBtn) undoBtn.disabled = !this.canUndo();
        if (redoBtn) redoBtn.disabled = !this.canRedo();
      }
    };

    // Context menu actions
    function contextEdit() {
      if (!currentNodeId) return;
      editCurrentNode();
    }

    function contextLink() {
      if (!currentNodeId) return;
      showAddEdgeModal();
    }

    async function contextComplete() {
      if (!currentNodeId) return;
      
      try {
        const res = await fetch('/api/node', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: currentNodeId, status: 'complete' }),
        });

        if (!res.ok) {
          const result = await res.json();
          toast('Error: ' + (result.error || 'Unknown error'), 'error');
          return;
        }

        loadGraph();
      } catch (err) {
        toast('Error: ' + err.message, 'error');
      }
    }

    function contextDelete() {
      if (!currentNodeId) return;
      deleteCurrentNode();
    }

    // Multi-select and bulk operations
    function updateSelectionCount() {
      const selected = cy.nodes('.selected-multi');
      const count = selected.length;
      const bulkActions = document.getElementById('bulk-actions');
      const countSpan = document.getElementById('selection-count');
      
      if (count > 0) {
        bulkActions.style.display = 'block';
        countSpan.textContent = `${count} selected`;
      } else {
        bulkActions.style.display = 'none';
      }
    }

    function clearSelection() {
      cy.nodes().removeClass('selected-multi');
      updateSelectionCount();
    }

    async function bulkSetStatus() {
      const select = document.getElementById('bulk-status');
      const status = select.value;
      if (!status) return;
      
      const selected = cy.nodes('.selected-multi');
      if (selected.length === 0) {
        select.value = '';
        return;
      }

      for (const node of selected) {
        try {
          await fetch('/api/node', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: node.id(), status }),
          });
        } catch (err) {
          console.error('Failed to update:', node.id(), err);
        }
      }

      toast(`Set ${selected.length} nodes to ${status}`, 'success');
      select.value = '';
      clearSelection();
      loadGraph();
    }

    async function bulkDelete() {
      const selected = cy.nodes('.selected-multi');
      if (selected.length === 0) return;
      
      if (!confirm(`Delete ${selected.length} nodes? This cannot be undone.`)) return;

      for (const node of selected) {
        try {
          await fetch(`/api/node?id=${encodeURIComponent(node.id())}`, {
            method: 'DELETE',
          });
        } catch (err) {
          console.error('Failed to delete:', node.id(), err);
        }
      }

      clearSelection();
      loadGraph();
    }

    // Quick add with templates
    const templates = {
      task: { title: '', tags: [], content: '## Acceptance Criteria\n\n- [ ] \n\n## Notes\n' },
      doc: { title: '', tags: ['documentation'], content: '## Overview\n\n## Details\n\n## References\n' },
      ideation: { title: '', tags: ['idea'], content: '## The Idea\n\n## Why it matters\n\n## Next steps\n' },
      brainfart: { title: '', tags: ['random'], content: '' },
      decision: { title: '', tags: ['decision'], content: '## Decision\n\n## Context\n\n## Options Considered\n\n## Rationale\n' },
    };

    function quickAdd(type) {
      const title = prompt(`New ${type} title:`);
      if (!title) return;

      const template = templates[type] || {};
      
      fetch('/api/node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title,
          content: template.content || '',
          tags: template.tags || [],
          status: 'pending',
          priority: 'normal',
        }),
      })
      .then(r => r.json())
      .then(result => {
        if (result.node) {
          history.push({ type: 'create', nodeId: result.node.id, data: { type, title } });
          loadGraph();
          toast(`Created ${type}: ${title}`, 'success');
        } else {
          toast('Error: ' + (result.error || 'Failed to create'), 'error');
        }
      })
      .catch(err => alert('Error: ' + err.message));
    }

    // Modal functions
    function showCreateModal() {
      document.getElementById('modal-title').textContent = 'New Node';
      document.getElementById('form-id').value = '';
      document.getElementById('node-form').reset();
      document.getElementById('modal-overlay').classList.add('active');
      document.getElementById('form-title').focus();
    }

    function showEditModal(node) {
      document.getElementById('modal-title').textContent = 'Edit Node';
      document.getElementById('form-id').value = node.id;
      document.getElementById('form-title').value = node.title;
      document.getElementById('form-type').value = node.type;
      document.getElementById('form-status').value = node.status;
      document.getElementById('form-priority').value = node.priority;
      document.getElementById('form-tags').value = (node.tags || []).join(', ');
      document.getElementById('form-content').value = node.content || '';
      document.getElementById('modal-overlay').classList.add('active');
    }

    function closeModal() {
      document.getElementById('modal-overlay').classList.remove('active');
    }

    async function submitNodeForm(e) {
      e.preventDefault();
      
      const id = document.getElementById('form-id').value;
      const data = {
        title: document.getElementById('form-title').value,
        type: document.getElementById('form-type').value,
        status: document.getElementById('form-status').value,
        priority: document.getElementById('form-priority').value,
        tags: document.getElementById('form-tags').value.split(',').map(t => t.trim()).filter(Boolean),
        content: document.getElementById('form-content').value,
      };

      try {
        const isEdit = !!id;
        
        // Get old data for undo if editing
        let oldData = null;
        if (isEdit) {
          const oldRes = await fetch(`/api/node?id=${encodeURIComponent(id)}`);
          const oldResult = await oldRes.json();
          if (oldResult.node) {
            oldData = {
              title: oldResult.node.title,
              type: oldResult.node.type,
              status: oldResult.node.status,
              priority: oldResult.node.priority,
              tags: oldResult.node.tags,
              content: oldResult.node.content,
            };
          }
        }
        
        const res = await fetch('/api/node', {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isEdit ? { id, ...data } : data),
        });

        const result = await res.json();
        
        if (!res.ok) {
          toast('Error: ' + (result.error || 'Unknown error'), 'error');
          return;
        }

        // Record history
        if (isEdit) {
          history.push({ type: 'update', nodeId: id, oldData, newData: data });
        } else {
          history.push({ type: 'create', nodeId: result.node.id, data });
        }

        closeModal();
        loadGraph();
        
        if (isEdit && currentNodeId === id) {
          showNodeDetail(id);
        }
      } catch (err) {
        toast('Error: ' + err.message, 'error');
      }
    }

    function editCurrentNode() {
      if (!currentNodeId) return;
      fetch(`/api/node?id=${encodeURIComponent(currentNodeId)}`)
        .then(r => r.json())
        .then(data => showEditModal(data.node))
        .catch(err => alert('Error: ' + err.message));
    }

    async function duplicateCurrentNode() {
      if (!currentNodeId) return;

      try {
        // Fetch current node data
        const res = await fetch(`/api/node?id=${encodeURIComponent(currentNodeId)}`);
        const data = await res.json();
        const node = data.node;

        // Create duplicate with modified title
        const createRes = await fetch('/api/node', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: node.type,
            title: `${node.title} (copy)`,
            content: node.content,
            status: 'pending', // Reset status
            priority: node.priority,
            tags: node.tags,
          }),
        });

        const result = await createRes.json();
        if (result.node) {
          history.push({ type: 'create', nodeId: result.node.id, data: result.node });
          toast('Node duplicated', 'success');
          loadGraph();
          showNodeDetail(result.node.id);
        } else {
          toast('Error: ' + (result.error || 'Failed to duplicate'), 'error');
        }
      } catch (err) {
        toast('Error: ' + err.message, 'error');
      }
    }

    async function deleteCurrentNode() {
      if (!currentNodeId) return;
      if (!confirm('Delete this node? (You can undo with Ctrl+Z)')) return;

      try {
        // Get node data for undo
        const oldRes = await fetch(`/api/node?id=${encodeURIComponent(currentNodeId)}`);
        const oldResult = await oldRes.json();
        
        const res = await fetch(`/api/node?id=${encodeURIComponent(currentNodeId)}`, {
          method: 'DELETE',
        });

        if (!res.ok) {
          const result = await res.json();
          toast('Error: ' + (result.error || 'Unknown error'), 'error');
          return;
        }

        // Record history
        if (oldResult.node) {
          history.push({ 
            type: 'delete', 
            nodeId: currentNodeId, 
            data: {
              type: oldResult.node.type,
              title: oldResult.node.title,
              content: oldResult.node.content,
              status: oldResult.node.status,
              priority: oldResult.node.priority,
              tags: oldResult.node.tags,
            }
          });
        }

        closeDetail();
        loadGraph();
      } catch (err) {
        toast('Error: ' + err.message, 'error');
      }
    }

    // Edge modal functions
    async function showAddEdgeModal() {
      if (!currentNodeId) return;
      
      document.getElementById('edge-from').value = currentNodeId;
      
      // Load all nodes for the target dropdown
      try {
        const res = await fetch('/api/nodes?limit=1000');
        const data = await res.json();
        
        const select = document.getElementById('edge-to');
        select.innerHTML = data.nodes
          .filter(n => n.id !== currentNodeId)
          .map(n => `<option value="${n.id}">${n.title} (${n.type})</option>`)
          .join('');
          
        document.getElementById('edge-modal-overlay').classList.add('active');
      } catch (err) {
        toast('Error loading nodes: ' + err.message, 'error');
      }
    }

    function closeEdgeModal() {
      document.getElementById('edge-modal-overlay').classList.remove('active');
    }

    // Quick link modal (for drag-to-link)
    function showQuickLinkModal(from, to) {
      const edgeTypes = ['depends-on', 'blocks', 'implements', 'documents', 'relates-to', 'spawns', 'part-of'];
      const fromNode = cy.getElementById(from);
      const toNode = cy.getElementById(to);
      
      const buttons = edgeTypes.map(t => 
        `<button class="btn btn-secondary" onclick="quickLink('${from}', '${t}', '${to}')">${t}</button>`
      ).join(' ');
      
      const modal = document.createElement('div');
      modal.className = 'modal-overlay active';
      modal.id = 'quick-link-modal';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
          <h2>Link Nodes</h2>
          <p style="margin-bottom: 12px;">
            <strong>${fromNode.data('label')}</strong> → <strong>${toNode.data('label')}</strong>
          </p>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${buttons}
          </div>
          <button class="btn" style="margin-top: 16px;" onclick="closeQuickLinkModal()">Cancel</button>
        </div>
      `;
      document.body.appendChild(modal);
    }

    function closeQuickLinkModal() {
      const modal = document.getElementById('quick-link-modal');
      if (modal) modal.remove();
    }

    async function quickLink(from, type, to) {
      try {
        const res = await fetch('/api/edge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, type, to }),
        });
        
        if (res.ok) {
          history.push({ type: 'link', edge: { from, type, to } });
          toast(`Linked: ${type}`, 'success');
          loadGraph();
        } else {
          const result = await res.json();
          toast('Error: ' + (result.error || 'Failed'), 'error');
        }
      } catch (err) {
        toast('Error: ' + err.message, 'error');
      }
      closeQuickLinkModal();
    }

    async function deleteEdge(from, type, to) {
      if (!confirm(`Remove "${type}" relationship? (Ctrl+Z to undo)`)) return;

      const edge = { from, type, to };

      try {
        const res = await fetch('/api/edge', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(edge),
        });

        if (!res.ok) {
          const result = await res.json();
          toast('Error: ' + (result.error || 'Unknown error'), 'error');
          return;
        }

        // Record history
        history.push({ type: 'unlink', edge });

        loadGraph();
        showNodeDetail(currentNodeId);
      } catch (err) {
        toast('Error: ' + err.message, 'error');
      }
    }

    async function submitEdgeForm(e) {
      e.preventDefault();
      
      const edge = {
        from: document.getElementById('edge-from').value,
        type: document.getElementById('edge-type').value,
        to: document.getElementById('edge-to').value,
      };

      try {
        const res = await fetch('/api/edge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(edge),
        });

        const result = await res.json();
        
        if (!res.ok) {
          toast('Error: ' + (result.error || 'Unknown error'), 'error');
          return;
        }

        // Record history
        history.push({ type: 'link', edge });

        closeEdgeModal();
        loadGraph();
        showNodeDetail(currentNodeId);
      } catch (err) {
        toast('Error: ' + err.message, 'error');
      }
    }

    // Export functions
    function exportJSON() {
      const data = {
        nodes: cy.nodes().map(n => n.data()),
        edges: cy.edges().map(e => e.data()),
        exportedAt: new Date().toISOString(),
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `memory-cube-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    async function importJSON(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.nodes || !Array.isArray(data.nodes)) {
          toast('Invalid format: expected { nodes: [...] }', 'error');
          return;
        }

        let imported = 0, errors = 0;
        
        for (const node of data.nodes) {
          try {
            // Only import if it has required fields
            if (node.type && node.title) {
              await fetch('/api/node', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: node.type,
                  title: node.title || node.label,
                  content: node.content || '',
                  status: node.status || 'pending',
                  priority: node.priority || 'normal',
                  tags: node.tags || [],
                }),
              });
              imported++;
            }
          } catch (err) {
            errors++;
            console.error('Import error:', err);
          }
        }

        toast(`Imported ${imported} nodes` + (errors > 0 ? `, ${errors} errors` : ''), errors > 0 ? 'error' : 'success');
        loadGraph();
        
      } catch (err) {
        toast('Failed to parse JSON: ' + err.message, 'error');
      }
      
      // Reset file input
      event.target.value = '';
    }

    function exportPNG() {
      const png = cy.png({ 
        output: 'blob', 
        bg: '#1a1a2e',
        scale: 2,
        full: true
      });
      
      const url = URL.createObjectURL(png);
      const a = document.createElement('a');
      a.href = url;
      a.download = `memory-cube-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }

    // Debounce helper
    function debounce(fn, ms) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
      };
    }

    // Auto-apply search filter on typing + show results dropdown
    const debouncedSearch = debounce(() => {
      loadGraph();
      showSearchResults();
    }, 300);
    document.getElementById('filter-search').addEventListener('input', debouncedSearch);
    
    // Hide search results when clicking elsewhere
    document.getElementById('filter-search').addEventListener('blur', () => {
      setTimeout(() => {
        document.getElementById('search-results').classList.remove('visible');
      }, 200);
    });

    async function showSearchResults() {
      const search = document.getElementById('filter-search').value.trim();
      const resultsDiv = document.getElementById('search-results');
      
      if (!search) {
        resultsDiv.classList.remove('visible');
        return;
      }

      try {
        const res = await fetch(`/api/nodes?search=${encodeURIComponent(search)}&limit=10`);
        const data = await res.json();
        
        if (data.nodes.length === 0) {
          resultsDiv.innerHTML = '<div class="search-result" style="color:#888">No results</div>';
        } else {
          resultsDiv.innerHTML = data.nodes.map(n => `
            <div class="search-result" onclick="focusNode('${n.id}')">
              ${n.title}<span class="search-result-type">${n.type}</span>
            </div>
          `).join('');
        }
        
        resultsDiv.classList.add('visible');
      } catch (err) {
        console.error('Search error:', err);
      }
    }

    function focusNode(nodeId) {
      document.getElementById('search-results').classList.remove('visible');
      
      const node = cy.getElementById(nodeId);
      if (node.length > 0) {
        cy.animate({
          center: { eles: node },
          zoom: 1.5
        }, {
          duration: 300
        });
        
        node.select();
        showNodeDetail(nodeId);
      }
    }

    // Mini-map
    function updateMinimap() {
      const canvas = document.getElementById('minimap-canvas');
      const ctx = canvas.getContext('2d');
      const viewport = document.getElementById('minimap-viewport');
      
      if (!cy || cy.nodes().length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        viewport.style.display = 'none';
        return;
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Get bounding box of all elements
      const bb = cy.elements().boundingBox();
      const padding = 10;
      
      // Calculate scale
      const scaleX = (canvas.width - padding * 2) / bb.w;
      const scaleY = (canvas.height - padding * 2) / bb.h;
      const scale = Math.min(scaleX, scaleY, 1);
      
      // Draw nodes
      cy.nodes().forEach(node => {
        const pos = node.position();
        const x = padding + (pos.x - bb.x1) * scale;
        const y = padding + (pos.y - bb.y1) * scale;
        
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = typeColors[node.data('type')] || '#666';
        ctx.fill();
      });
      
      // Draw edges
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.5;
      cy.edges().forEach(edge => {
        const source = edge.source().position();
        const target = edge.target().position();
        
        ctx.beginPath();
        ctx.moveTo(padding + (source.x - bb.x1) * scale, padding + (source.y - bb.y1) * scale);
        ctx.lineTo(padding + (target.x - bb.x1) * scale, padding + (target.y - bb.y1) * scale);
        ctx.stroke();
      });
      
      // Update viewport indicator
      const ext = cy.extent();
      const vx = padding + (ext.x1 - bb.x1) * scale;
      const vy = padding + (ext.y1 - bb.y1) * scale;
      const vw = ext.w * scale;
      const vh = ext.h * scale;
      
      viewport.style.display = 'block';
      viewport.style.left = Math.max(0, vx) + 'px';
      viewport.style.top = Math.max(0, vy) + 'px';
      viewport.style.width = Math.min(vw, canvas.width) + 'px';
      viewport.style.height = Math.min(vh, canvas.height) + 'px';
    }

    // Update minimap on pan/zoom
    function setupMinimapUpdates() {
      cy.on('pan zoom', debounce(updateMinimap, 100));
      cy.on('add remove', debounce(updateMinimap, 100));
    }

    // Make sidebar sections collapsible
    function setupCollapsibleSections() {
      document.querySelectorAll('.sidebar h2').forEach(h2 => {
        // Wrap following elements in a collapsible div
        const wrapper = document.createElement('div');
        wrapper.className = 'collapsible';
        
        let el = h2.nextElementSibling;
        const toWrap = [];
        while (el && el.tagName !== 'H2' && el.tagName !== 'H1') {
          toWrap.push(el);
          el = el.nextElementSibling;
        }
        
        if (toWrap.length > 0) {
          h2.after(wrapper);
          toWrap.forEach(e => wrapper.appendChild(e));
        }
        
        h2.addEventListener('click', () => {
          h2.classList.toggle('collapsed');
          wrapper.classList.toggle('collapsed');
        });
      });
    }

    // Load filters from URL on startup
    function loadFiltersFromURL() {
      const params = new URLSearchParams(window.location.search);
      
      if (params.get('type')) {
        activeTypes = new Set(params.get('type').split(','));
      }
      if (params.get('status')) {
        document.getElementById('filter-status').value = params.get('status');
      }
      if (params.get('validity')) {
        document.getElementById('filter-validity').value = params.get('validity');
      }
      if (params.get('time')) {
        document.getElementById('filter-time').value = params.get('time');
      }
      if (params.get('search')) {
        document.getElementById('filter-search').value = params.get('search');
      }
      if (params.get('starred') === 'true') {
        document.getElementById('filter-starred').checked = true;
      }
    }

    // Update URL with current filter state
    function updateURL() {
      const params = new URLSearchParams();
      
      if (activeTypes.size > 0) {
        params.set('type', Array.from(activeTypes).join(','));
      }
      
      const status = document.getElementById('filter-status').value;
      if (status) params.set('status', status);
      
      const validity = document.getElementById('filter-validity').value;
      if (validity) params.set('validity', validity);
      
      const time = document.getElementById('filter-time').value;
      if (time) params.set('time', time);
      
      const search = document.getElementById('filter-search').value;
      if (search) params.set('search', search);
      
      if (document.getElementById('filter-starred').checked) {
        params.set('starred', 'true');
      }
      
      const url = params.toString() ? `?${params}` : window.location.pathname;
      window.history.replaceState({}, '', url);
    }

    // Initialize
    initCytoscape();
    setupMinimapUpdates();
    setupCollapsibleSections();
    loadFiltersFromURL();
    loadTypes();
    loadGraph();
