document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let courses = [];
    let selectedCourse = null;
    let selectedSection = null;
    let downloadEventSource = null;

    // --- DOM Elements ---
    const badgeCookieStatus = document.getElementById('cookie-status-badge');
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const settingsModal = document.getElementById('settings-modal');
    const btnCloseSettingsModal = document.getElementById('btn-close-settings-modal');
    const btnCancelSettings = document.getElementById('btn-cancel-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const cookiesTextarea = document.getElementById('cookies-textarea');

    const courseSearchInput = document.getElementById('course-search');
    const searchInputWrapper = document.querySelector('.search-input-wrapper');
    const btnClearSearch = document.getElementById('btn-clear-search');
    const coursesDropdown = document.getElementById('courses-dropdown');
    const coursesList = document.getElementById('courses-list');
    const selectedCourseCard = document.getElementById('selected-course-card');
    const selectedCodeSpan = document.getElementById('selected-code');
    const selectedTitleSpan = document.getElementById('selected-title');
    const btnRemoveSelected = document.getElementById('btn-remove-selected');

    const sectionGroup = document.getElementById('section-group');
    const sectionsContainer = document.getElementById('sections-container');
    const btnStartDownload = document.getElementById('btn-start-download');

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const btnRefreshFiles = document.getElementById('btn-refresh-files');
    const fileBrowserContainer = document.getElementById('file-browser-container');

    const progressWrapper = document.getElementById('progress-wrapper');
    const progressTitleText = document.getElementById('progress-title-text');
    const progressPercent = document.getElementById('progress-percent');
    const progressBar = document.getElementById('progress-bar');
    const progressNumbers = document.getElementById('progress-numbers');
    const progressSpinner = document.getElementById('progress-spinner');

    const progressEmptyState = document.getElementById('progress-empty-state');
    const progressBoard = document.getElementById('progress-board');

    const viewerModal = document.getElementById('viewer-modal');
    const btnCloseViewerModal = document.getElementById('btn-close-viewer-modal');
    const viewerTitle = document.getElementById('viewer-title');
    const viewerBody = document.getElementById('viewer-body');
    const btnViewerOpenPdf = document.getElementById('btn-viewer-open-pdf');

    // --- Initial Load ---
    checkCookieStatus();
    loadCourses();

    // --- Tab Switching ---
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            if (tabId === 'tab-files') {
                loadDownloadedFiles();
            }
        });
    });

    // --- Settings Modal ---
    btnOpenSettings.addEventListener('click', () => {
        // Fetch current cookies to pre-fill
        fetch('/api/cookies')
            .then(res => res.json())
            .then(data => {
                cookiesTextarea.value = data.cookies || '';
                openModal(settingsModal);
            });
    });

    btnCloseSettingsModal.addEventListener('click', () => closeModal(settingsModal));
    btnCancelSettings.addEventListener('click', () => closeModal(settingsModal));
    
    btnSaveSettings.addEventListener('click', () => {
        const cookies = cookiesTextarea.value;
        fetch('/api/cookies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cookies })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                logToConsole(`Systém: Cookies byly úspěšně uloženy.`, 'system-line');
                closeModal(settingsModal);
                checkCookieStatus();
            } else {
                alert(`Chyba: ${data.message}`);
            }
        });
    });

    // --- Course Selection Flow ---
    courseSearchInput.addEventListener('focus', () => {
        if (courses.length > 0) {
            showDropdown();
        }
    });

    courseSearchInput.addEventListener('input', () => {
        const query = courseSearchInput.value.toLowerCase().trim();
        btnClearSearch.style.display = query ? 'block' : 'none';
        filterCourses(query);
        showDropdown();
    });

    btnClearSearch.addEventListener('click', () => {
        courseSearchInput.value = '';
        btnClearSearch.style.display = 'none';
        filterCourses('');
        courseSearchInput.focus();
    });

    btnRemoveSelected.addEventListener('click', () => {
        selectedCourse = null;
        selectedSection = null;
        selectedCourseCard.style.display = 'none';
        searchInputWrapper.style.display = 'block';
        courseSearchInput.value = '';
        btnClearSearch.style.display = 'none';
        
        sectionGroup.style.opacity = '0.5';
        sectionGroup.style.pointerEvents = 'none';
        sectionsContainer.innerHTML = '<div class="placeholder-text">Vyberte nejdříve předmět</div>';
        
        btnStartDownload.disabled = true;
        
        // Reset progress UI
        progressEmptyState.style.display = 'flex';
        progressBoard.style.display = 'none';
        progressBoard.innerHTML = '';
        progressWrapper.style.display = 'none';
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.form-group')) {
            hideDropdown();
        }
    });

    // --- Helper Functions ---
    function openModal(modal) {
        modal.classList.add('active');
    }

    function closeModal(modal) {
        modal.classList.remove('active');
    }

    function showDropdown() {
        if (!selectedCourse) {
            coursesDropdown.style.display = 'block';
        }
    }

    function hideDropdown() {
        coursesDropdown.style.display = 'none';
    }

    function checkCookieStatus() {
        fetch('/api/cookies')
            .then(res => res.json())
            .then(data => {
                const dot = badgeCookieStatus.querySelector('.status-dot');
                const text = badgeCookieStatus.querySelector('.status-text');
                
                if (data.has_cookies) {
                    dot.className = 'status-dot green';
                    text.innerText = 'Cookies nastaveny';
                } else {
                    dot.className = 'status-dot red';
                    text.innerText = 'Chybí přihlášení (cookies)';
                }
            })
            .catch(() => {
                const dot = badgeCookieStatus.querySelector('.status-dot');
                const text = badgeCookieStatus.querySelector('.status-text');
                dot.className = 'status-dot red';
                text.innerText = 'Chyba připojení';
            });
    }

    function loadCourses() {
        fetch('/api/courses')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    courses = data.courses;
                    renderCoursesList(courses);
                } else {
                    coursesList.innerHTML = `<div class="dropdown-loading" style="color: var(--error);"><i class="fa-solid fa-triangle-exclamation"></i> Chyba při načítání: ${data.message}</div>`;
                }
            })
            .catch(err => {
                coursesList.innerHTML = `<div class="dropdown-loading" style="color: var(--error);"><i class="fa-solid fa-triangle-exclamation"></i> Chyba sítě.</div>`;
            });
    }

    function renderCoursesList(items) {
        if (items.length === 0) {
            coursesList.innerHTML = `<div class="dropdown-loading">Žádné předměty nenalezeny</div>`;
            return;
        }
        
        coursesList.innerHTML = '';
        items.forEach(c => {
            const div = document.createElement('div');
            div.className = 'dropdown-item';
            div.innerHTML = `
                <span class="course-code">${c.code.toUpperCase()}</span>
                <span class="course-title">${c.title}</span>
            `;
            div.addEventListener('click', () => selectCourse(c));
            coursesList.appendChild(div);
        });
    }

    function filterCourses(query) {
        if (!query) {
            renderCoursesList(courses);
            return;
        }
        const filtered = courses.filter(c => 
            c.code.toLowerCase().includes(query) || 
            c.title.toLowerCase().includes(query)
        );
        renderCoursesList(filtered);
    }

    function selectCourse(course) {
        selectedCourse = course;
        hideDropdown();
        
        // Update UI Card
        selectedCodeSpan.innerText = course.code.toUpperCase();
        selectedTitleSpan.innerText = course.title;
        searchInputWrapper.style.display = 'none';
        selectedCourseCard.style.display = 'flex';
        
        logToConsole(`Systém: Vybrán předmět ${course.code.toUpperCase()} - ${course.title}`, 'system-line');
        
        // Fetch Sections
        loadSections(course.code);
    }

    function loadSections(courseCode) {
        sectionsContainer.innerHTML = '<div class="placeholder-text"><i class="fa-solid fa-spinner fa-spin"></i> Hledání sekcí a materiálů...</div>';
        sectionGroup.style.opacity = '1';
        sectionGroup.style.pointerEvents = 'auto';

        fetch(`/api/sections?course=${courseCode}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    renderSections(data.sections);
                } else {
                    sectionsContainer.innerHTML = `<div class="placeholder-text" style="color: var(--error); border-color: var(--error);">Chyba: ${data.message}</div>`;
                }
            })
            .catch(() => {
                sectionsContainer.innerHTML = '<div class="placeholder-text" style="color: var(--error);">Chyba sítě.</div>';
            });
    }

    function renderSections(sections) {
        if (sections.length === 0) {
            sectionsContainer.innerHTML = '<div class="placeholder-text">Nebyly nalezeny žádné materiály pro tento předmět.</div>';
            return;
        }

        sectionsContainer.innerHTML = '';
        sections.forEach(s => {
            const div = document.createElement('div');
            div.className = 'section-tile';
            div.innerHTML = `
                <span class="section-name">${s.name}</span>
                <span class="section-count">${s.count} stránek</span>
            `;
            div.addEventListener('click', () => selectSection(s.name, div));
            sectionsContainer.appendChild(div);
        });
    }

    function selectSection(name, element) {
        selectedSection = name;
        
        // Highlight active tile
        document.querySelectorAll('.section-tile').forEach(t => t.classList.remove('selected'));
        element.classList.add('selected');
        
        btnStartDownload.disabled = false;
        logToConsole(`Systém: Vybrána sekce '${name}'`, 'system-line');
    }

    // --- Console Logger ---
    function logToConsole(text, className = '') {
        console.log(`[LOG] ${text}`);
    }

    const btnClearDownloads = document.getElementById('btn-clear-downloads');
    if (btnClearDownloads) {
        btnClearDownloads.addEventListener('click', () => {
            if (!confirm("Opravdu chcete smazat všechny stažené soubory a vyčistit mezipaměť? Tato akce vymaže veškeré lokální soubory a vynutí nové stažení z FitWiki.")) return;
            
            btnClearDownloads.disabled = true;
            btnClearDownloads.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Čištění...';
            
            fetch('/api/cleanup', { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                    btnClearDownloads.disabled = false;
                    btnClearDownloads.innerHTML = '<i class="fa-solid fa-trash-can"></i> Smazat stažené & cache';
                    
                    if (data.success) {
                        logToConsole(`Systém: ${data.message}`, 'success-line');
                        loadDownloadedFiles();
                    } else {
                        logToConsole(`Chyba čištění: ${data.message}`, 'error-line');
                        alert("Chyba při čištění: " + data.message);
                    }
                })
                .catch(err => {
                    btnClearDownloads.disabled = false;
                    btnClearDownloads.innerHTML = '<i class="fa-solid fa-trash-can"></i> Smazat stažené & cache';
                    logToConsole("Chyba: Selhání komunikace se serverem.", "error-line");
                });
        });
    }

    // --- Download Flow (SSE) ---
    btnStartDownload.addEventListener('click', () => {
        if (!selectedCourse || !selectedSection) return;

        // Reset progress bar
        progressWrapper.style.display = 'block';
        progressBar.style.width = '0%';
        progressPercent.innerText = '0%';
        progressNumbers.innerText = 'Inicializace stahování...';
        progressSpinner.style.display = 'block';
        btnStartDownload.disabled = true;
        btnRemoveSelected.disabled = true;

        progressEmptyState.style.display = 'none';
        progressBoard.style.display = 'flex';
        progressBoard.innerHTML = '<div class="placeholder-text"><i class="fa-solid fa-spinner fa-spin"></i> Hledání stránek a příloh...</div>';

        logToConsole(`Stahování: Spouštím import pro ${selectedCourse.code.toUpperCase()} -> ${selectedSection}...`, 'system-line');

        // Close existing SSE if any
        if (downloadEventSource) {
            downloadEventSource.close();
        }

        const url = `/api/download?course=${selectedCourse.code}&section=${selectedSection}`;
        downloadEventSource = new EventSource(url);

        downloadEventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.status === 'log') {
                logToConsole(data.message);
            } 
            else if (data.status === 'start') {
                logToConsole(`Stahování: Nalezeno ${data.total} položek. Spouštím stahování...`, 'system-line');
                progressNumbers.innerText = `0 / ${data.total} hotovo`;
                progressBoard.innerHTML = '';
                
                data.pages.forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'progress-card-row';
                    row.id = `progress-row-${item.index}`;
                    row.style.cssText = `
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        background: rgba(255, 255, 255, 0.02);
                        border: 1px solid var(--border-color);
                        border-radius: 8px;
                        padding: 10px 14px;
                        transition: var(--transition-fast);
                        gap: 12px;
                    `;
                    row.innerHTML = `
                        <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex-grow: 1; align-items: flex-start;">
                            <div style="display: flex; align-items: center; gap: 8px; min-width: 0; width: 100%;">
                                <span class="row-index" style="font-size: 10px; font-weight: 700; color: var(--text-muted); background: rgba(255,255,255,0.04); width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 50%; flex-shrink: 0;">${item.index}</span>
                                <span class="row-title" style="font-size: 13px; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-grow: 1;" title="${item.title}">${item.title}</span>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                            <div class="row-badges" style="display: flex; gap: 4px;"></div>
                            <span class="row-status" style="font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 12px; display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.04); color: var(--text-muted);">
                                <i class="fa-regular fa-clock"></i> Čeká
                            </span>
                        </div>
                    `;
                    progressBoard.appendChild(row);
                });
            } 
            else if (data.status === 'progress') {
                logToConsole(data.log);
                const percent = Math.round(((data.index - 1) / data.total) * 100);
                progressBar.style.width = `${percent}%`;
                progressPercent.innerText = `${percent}%`;
                progressNumbers.innerText = `${data.index - 1} / ${data.total} hotovo`;

                const row = document.getElementById(`progress-row-${data.index}`);
                if (row) {
                    row.style.background = 'rgba(139, 92, 246, 0.04)';
                    row.style.borderColor = 'rgba(139, 92, 246, 0.3)';
                    const statusSpan = row.querySelector('.row-status');
                    statusSpan.style.background = 'rgba(139, 92, 246, 0.15)';
                    statusSpan.style.color = 'var(--primary)';
                    statusSpan.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Stahuje se';
                    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            } 
            else if (data.status === 'progress_detail') {
                logToConsole(data.log, 'detail-line');
                const percent = Math.round((data.index / data.total) * 100);
                progressBar.style.width = `${percent}%`;
                progressPercent.innerText = `${percent}%`;
                progressNumbers.innerText = `${data.index} / ${data.total} hotovo`;

                const row = document.getElementById(`progress-row-${data.index}`);
                if (row) {
                    const isFailed = data.log.includes("FAILED");
                    if (isFailed) {
                        row.style.background = 'rgba(239, 68, 68, 0.04)';
                        row.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                        
                        const statusSpan = row.querySelector('.row-status');
                        statusSpan.style.background = 'rgba(239, 68, 68, 0.15)';
                        statusSpan.style.color = 'var(--error)';
                        statusSpan.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Chyba';
                        
                        // Add error detail text below title if not already added
                        if (!row.querySelector('.row-error')) {
                            const titleContainer = row.firstElementChild;
                            const errDiv = document.createElement('div');
                            errDiv.className = 'row-error';
                            errDiv.style.cssText = 'font-size: 11px; color: var(--error); margin-top: 4px; font-weight: 500; padding-left: 28px;';
                            errDiv.innerText = data.log.replace("FAILED:", "").trim();
                            titleContainer.appendChild(errDiv);
                        }
                    } else {
                        row.style.background = 'rgba(16, 185, 129, 0.04)';
                        row.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                        
                        const statusSpan = row.querySelector('.row-status');
                        statusSpan.style.background = 'rgba(16, 185, 129, 0.15)';
                        statusSpan.style.color = 'var(--success)';
                        statusSpan.innerHTML = '<i class="fa-solid fa-circle-check"></i> Hotovo';
                        
                        // Add format badges
                        const badgesContainer = row.querySelector('.row-badges');
                        badgesContainer.innerHTML = '';
                        
                        const hasMd = data.log.includes("Saved MD");
                        const hasPdf = data.pdf_success;
                        const hasAttachment = data.log.includes("Saved attachment");
                        
                        if (hasMd) {
                            badgesContainer.innerHTML += '<span style="background: rgba(139,92,246,0.1); color: var(--primary); font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(139,92,246,0.2);">MD</span>';
                        }
                        if (hasPdf) {
                            badgesContainer.innerHTML += '<span style="background: rgba(16,185,129,0.1); color: var(--success); font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(16,185,129,0.2);">PDF</span>';
                        }
                        if (hasAttachment) {
                            // Extract extension or use generic ATTACH
                            let ext = "ATT";
                            const match = data.log.match(/Saved attachment to .*\.(\w+)/i);
                            if (match) ext = match[1].toUpperCase();
                            badgesContainer.innerHTML += `<span style="background: rgba(245,158,11,0.1); color: #f59e0b; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(245,158,11,0.2);">${ext}</span>`;
                        }
                    }
                }
            } 
            else if (data.status === 'complete') {
                logToConsole(data.message, 'success-line');
                progressBar.style.width = `100%`;
                progressPercent.innerText = `100%`;
                progressNumbers.innerText = `Dokončeno!`;
                progressSpinner.style.display = 'none';
                
                btnStartDownload.disabled = false;
                btnRemoveSelected.disabled = false;
                downloadEventSource.close();
                loadDownloadedFiles(); // Refresh files tab
            } 
            else if (data.status === 'error') {
                logToConsole(`CHYBA: ${data.message}`, 'error-line');
                progressSpinner.style.display = 'none';
                progressNumbers.innerText = `Stahování selhalo.`;
                btnStartDownload.disabled = false;
                btnRemoveSelected.disabled = false;
                downloadEventSource.close();
            }
        };

        downloadEventSource.onerror = (err) => {
            logToConsole(`Chyba sítě: Připojení k event-streamu bylo přerušeno.`, 'error-line');
            progressSpinner.style.display = 'none';
            btnStartDownload.disabled = false;
            btnRemoveSelected.disabled = false;
            downloadEventSource.close();
        };
    });

    // --- Files Browser Section ---
    btnRefreshFiles.addEventListener('click', loadDownloadedFiles);

    function loadDownloadedFiles() {
        fileBrowserContainer.innerHTML = '<div class="browser-loading"><i class="fa-solid fa-spinner fa-spin"></i> Hledání souborů...</div>';
        
        fetch('/api/files?t=' + Date.now())
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    renderDownloadedFiles(data.data);
                } else {
                    fileBrowserContainer.innerHTML = `<div class="placeholder-text" style="color: var(--error);">Chyba: ${data.message}</div>`;
                }
            })
            .catch(() => {
                fileBrowserContainer.innerHTML = '<div class="placeholder-text" style="color: var(--error);">Chyba sítě při načítání souborů.</div>';
            });
    }

    function renderDownloadedFiles(coursesData) {
        if (Object.keys(coursesData).length === 0) {
            fileBrowserContainer.innerHTML = '<div class="placeholder-text">Dosud nebyly staženy žádné materiály.</div>';
            return;
        }

        fileBrowserContainer.innerHTML = '';
        
        // Loop courses
        for (const courseCode in coursesData) {
            const courseCard = document.createElement('div');
            courseCard.className = 'course-group-card';
            
            const header = document.createElement('div');
            header.className = 'course-group-header';
            header.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> ${courseCode.toUpperCase()}`;
            courseCard.appendChild(header);
            
            const wrapper = document.createElement('div');
            wrapper.className = 'section-group-wrapper';
            
            // Loop sections in course
            const sections = coursesData[courseCode];
            for (const sectionName in sections) {
                const sectionTitleWrapper = document.createElement('div');
                sectionTitleWrapper.className = 'section-group-title-wrapper';
                sectionTitleWrapper.innerHTML = `
                    <div class="section-title-left" style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex-grow: 1;">
                        <i class="fa-solid fa-chevron-right toggle-icon" style="transition: transform 0.2s; color: var(--text-muted); font-size: 11px;"></i>
                        <span class="section-group-title" style="padding: 0; user-select: none;">${sectionName}</span>
                    </div>
                    <div class="zip-actions-group" style="display: flex; gap: 8px; align-items: center;">
                        <select class="form-select zip-format-select" style="background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 11px; padding: 4px 8px; outline: none; cursor: pointer; font-family: var(--font-sans); font-weight: 500;">
                            <option value="both">MD + PDF</option>
                            <option value="pdf">Pouze PDF</option>
                            <option value="md">Pouze Markdown</option>
                        </select>
                        <button class="btn btn-secondary btn-sm btn-zip" data-course="${courseCode}" data-section="${sectionName}">
                            <i class="fa-solid fa-file-zipper"></i> Stáhnout ZIP
                        </button>
                    </div>
                `;
                wrapper.appendChild(sectionTitleWrapper);
                
                // Add click handler for ZIP download
                sectionTitleWrapper.querySelector('.btn-zip').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const c = e.currentTarget.getAttribute('data-course');
                    const s = e.currentTarget.getAttribute('data-section');
                    const select = sectionTitleWrapper.querySelector('.zip-format-select');
                    const format = select.value;
                    
                    const fmtMarkdown = (format === 'both' || format === 'md');
                    const fmtPdf = (format === 'both' || format === 'pdf');
                    
                    window.open(`/api/archive?course=${c}&section=${s}&markdown=${fmtMarkdown}&pdf=${fmtPdf}`, '_blank');
                });
                
                // Create a container specifically for this section's files
                const sectionFilesContainer = document.createElement('div');
                sectionFilesContainer.className = 'section-files-container';
                sectionFilesContainer.style.display = 'none'; // collapsed by default
                sectionFilesContainer.style.flexDirection = 'column';
                sectionFilesContainer.style.gap = '8px';
                sectionFilesContainer.style.marginTop = '8px';
                sectionFilesContainer.style.marginBottom = '12px';
                
                // Add click handler to toggle collapse/expand
                sectionTitleWrapper.querySelector('.section-title-left').addEventListener('click', () => {
                    const isCollapsed = sectionFilesContainer.style.display === 'none';
                    sectionFilesContainer.style.display = isCollapsed ? 'flex' : 'none';
                    const icon = sectionTitleWrapper.querySelector('.toggle-icon');
                    icon.style.transform = isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)';
                    icon.style.color = isCollapsed ? 'var(--accent)' : 'var(--text-muted)';
                });
                
                // Loop files in section
                sections[sectionName].forEach(file => {
                    const item = document.createElement('div');
                    item.className = 'file-item';
                    
                    // Choose icon
                    let iconClass = 'fa-regular fa-file-lines';
                    if (file.has_attachment && !file.has_md) {
                        const ext = file.attachment_file.split('.').pop().toLowerCase();
                        if (ext === 'zip' || ext === 'rar' || ext === '7z') {
                            iconClass = 'fa-regular fa-file-zipper';
                        } else {
                            iconClass = 'fa-regular fa-file';
                        }
                    }
                    
                    item.innerHTML = `
                        <div class="file-title-wrapper">
                            <i class="${iconClass}" style="${file.has_attachment && !file.has_md ? 'color: var(--accent);' : ''}"></i>
                            <span class="file-title" title="${file.title}">${file.title}</span>
                        </div>
                        <div class="file-actions">
                            ${file.has_md ? `<button class="btn-icon btn-view" title="Zobrazit v prohlížeči"><i class="fa-solid fa-eye"></i></button>` : ''}
                            ${file.has_pdf ? `<button class="btn-icon btn-pdf" title="Stáhnout PDF"><i class="fa-solid fa-file-pdf"></i></button>` : ''}
                            ${file.has_attachment ? `<button class="btn-icon btn-raw-download" title="Stáhnout přílohu"><i class="fa-solid fa-download"></i></button>` : ''}
                        </div>
                    `;
                    
                    // Attach click handlers
                    if (file.has_md) {
                        item.querySelector('.btn-view').addEventListener('click', () => openMarkdownViewer(file.md_file, file.title, file.pdf_file));
                    }
                    
                    if (file.has_pdf) {
                        item.querySelector('.btn-pdf').addEventListener('click', () => {
                            window.open(`/downloads/pdf/${file.pdf_file}`, '_blank');
                        });
                    }
                    
                    if (file.has_attachment) {
                        item.querySelector('.btn-raw-download').addEventListener('click', () => {
                            window.open(`/downloads/markdown/${file.attachment_file}`, '_blank');
                        });
                    }
                    
                    sectionFilesContainer.appendChild(item);
                });
                
                wrapper.appendChild(sectionFilesContainer);
            }
            
            courseCard.appendChild(wrapper);
            fileBrowserContainer.appendChild(courseCard);
        }
    }

    // --- Markdown Viewer Modal ---
    function openMarkdownViewer(mdFileUrl, title, pdfFileUrl) {
        viewerTitle.innerText = title;
        viewerBody.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Načítání obsahu...</div>';
        
        if (pdfFileUrl) {
            btnViewerOpenPdf.href = `/downloads/pdf/${pdfFileUrl}`;
            btnViewerOpenPdf.style.display = 'inline-flex';
        } else {
            btnViewerOpenPdf.style.display = 'none';
        }

        openModal(viewerModal);

        fetch(`/downloads/markdown/${mdFileUrl}`)
            .then(res => {
                if (!res.ok) throw new Error('File not found');
                return res.text();
            })
            .then(markdown => {
                // Parse markdown to HTML
                const parsedHtml = marked.parse(markdown);
                
                // Set HTML content
                viewerBody.innerHTML = parsedHtml;
                
                // Adjust relative image URLs to load via Flask server correctly
                const courseSectionPath = mdFileUrl.substring(0, mdFileUrl.lastIndexOf('/'));
                viewerBody.querySelectorAll('img').forEach(img => {
                    const src = img.getAttribute('src');
                    if (src && !src.startsWith('http') && !src.startsWith('/')) {
                        img.src = `/downloads/markdown/${courseSectionPath}/${src}`;
                    }
                });
            })
            .catch(err => {
                viewerBody.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--error);"><i class="fa-solid fa-circle-exclamation"></i> Nelze načíst soubor: ${err.message}</div>`;
            });
    }

    btnCloseViewerModal.addEventListener('click', () => closeModal(viewerModal));
});
