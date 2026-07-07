import os
import sys
import json
import time
from flask import Flask, render_template, jsonify, request, Response, send_from_directory
from dotenv import load_dotenv, set_key

# Load Flask dotenv if exists
load_dotenv()

# Dynamic resolution of the fitwiki package path (Submodule support)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SUBMODULE_PATH = os.path.join(BASE_DIR, "lib", "fitwiki")
DEV_PATH = os.getenv("FITWIKI_CORE_PATH")

if os.path.exists(SUBMODULE_PATH):
    if SUBMODULE_PATH not in sys.path:
        sys.path.insert(0, SUBMODULE_PATH)
elif DEV_PATH and os.path.exists(DEV_PATH):
    if DEV_PATH not in sys.path:
        sys.path.insert(0, DEV_PATH)

try:
    from fitwiki import FitWikiClient, FitWikiConfig
except ImportError as e:
    print(f"Error importing fitwiki package: {e}")
    sys.exit(1)

app = Flask(__name__)

# Directory setup inside Flask app
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# Build custom config targeting the Flask downloads directory
def get_fitwiki_client():
    # Load cookies from fitwiki-mcp's .env if not found locally
    local_env_path = os.path.join(BASE_DIR, ".env")
    fitwiki_env_path = os.path.join(FITWIKI_MCP_PATH, ".env")
    
    cookies_str = ""
    # Try local .env first
    if os.path.exists(local_env_path):
        load_dotenv(local_env_path, override=True)
        cookies_str = os.environ.get("FITWIKI_COOKIES", "")
        
    # Fallback to fitwiki-mcp .env
    if not cookies_str and os.path.exists(fitwiki_env_path):
        load_dotenv(fitwiki_env_path, override=True)
        cookies_str = os.environ.get("FITWIKI_COOKIES", "")

    # Base URL and delay
    base_url = os.environ.get("FITWIKI_BASE_URL", "https://fit-wiki.cz")
    delay_str = os.environ.get("FITWIKI_DELAY", "1.0")
    try:
        delay = float(delay_str)
    except ValueError:
        delay = 1.0

    config = FitWikiConfig(
        cookies_str=cookies_str,
        base_url=base_url,
        delay=delay,
        cache_dir=os.path.join(DOWNLOADS_DIR, "cache"),
        markdown_dir=os.path.join(DOWNLOADS_DIR, "markdown_output"),
        pdf_dir=os.path.join(DOWNLOADS_DIR, "pdfs")
    )
    return FitWikiClient(config)

@app.after_request
def add_header(response):
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/cookies', methods=['GET', 'POST'])
def handle_cookies():
    local_env_path = os.path.join(BASE_DIR, ".env")
    if request.method == 'POST':
        data = request.json or {}
        cookies = data.get('cookies', '').strip()
        
        # Save to local .env file
        try:
            set_key(local_env_path, "FITWIKI_COOKIES", cookies)
            os.environ["FITWIKI_COOKIES"] = cookies
            return jsonify({'success': True, 'message': 'Cookies saved successfully.'})
        except Exception as e:
            return jsonify({'success': False, 'message': f'Failed to write to .env: {e}'})
            
    # GET method
    client = get_fitwiki_client()
    return jsonify({
        'cookies': client.config.cookies_str,
        'has_cookies': bool(client.config.cookies_str)
    })

@app.route('/api/courses')
def list_courses():
    try:
        client = get_fitwiki_client()
        courses = client.list_courses()
        return jsonify({'success': True, 'courses': courses})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/sections')
def list_sections():
    course = request.args.get('course', '').strip()
    if not course:
        return jsonify({'success': False, 'message': 'Course parameter required.'})
        
    try:
        client = get_fitwiki_client()
        sections = client.list_course_sections(course)
        return jsonify({'success': True, 'sections': sections})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/download')
def download_section():
    course = request.args.get('course', '').strip().lower()
    section = request.args.get('section', '').strip().lower()
    save_markdown = request.args.get('markdown', 'true').lower() == 'true'
    compile_pdf = request.args.get('pdf', 'true').lower() == 'true'

    if not course or not section:
        return Response("data: " + json.dumps({'status': 'error', 'message': 'Missing course or section.'}) + "\n\n", mimetype='text/event-stream')

    def event_stream():
        try:
            yield "data: " + json.dumps({'status': 'log', 'message': f'Initializing client for course: {course.upper()}, section: {section}...'}) + "\n\n"
            client = get_fitwiki_client()
            
            yield "data: " + json.dumps({'status': 'log', 'message': 'Fetching list of section pages...'}) + "\n\n"
            pages = client.list_section_pages(course, section)
            
            if not pages:
                yield "data: " + json.dumps({'status': 'error', 'message': f'No pages found for course {course.upper()} in section {section}.'}) + "\n\n"
                return
                
            total = len(pages)
            yield "data: " + json.dumps({'status': 'log', 'message': f'Found {total} pages to download.'}) + "\n\n"
            yield "data: " + json.dumps({
                'status': 'start', 
                'total': total,
                'pages': [{'index': idx, 'title': client._clean_title(p['title'], section, p['url'])} for idx, p in enumerate(pages, 1)]
            }) + "\n\n"

            for idx, p in enumerate(pages, 1):
                raw_title = p['title']
                url = p['url']
                title = client._clean_title(raw_title, section, url)
                yield "data: " + json.dumps({
                    'status': 'progress', 
                    'index': idx, 
                    'total': total, 
                    'page': title,
                    'log': f"[{idx}/{total}] Scraping: '{title}'..."
                }) + "\n\n"
                try:
                    # Download and compile to PDF based on user choice
                    res = client.download_page(url, section, raw_title, compile_pdf=compile_pdf, course_code=course)
                    
                    status_log = ""
                    if res.get('is_attachment'):
                        # For attachment downloads, only report the relevant saved file type
                        if res.get('pdf_success') and res.get('pdf_path'):
                            status_log += f"  Saved PDF to {os.path.basename(res['pdf_path'])}"
                        elif res.get('attachment_path'):
                            status_log += f"  Saved attachment to {os.path.basename(res['attachment_path'])}"
                    else:
                        # Normal wiki page scraping
                        if res.get('markdown_path'):
                            if save_markdown:
                                status_log += f"  Saved MD to {os.path.basename(res['markdown_path'])}"
                            else:
                                if os.path.exists(res['markdown_path']):
                                    try:
                                        os.remove(res['markdown_path'])
                                    except:
                                        pass
                                        
                        if compile_pdf and res.get('pdf_success'):
                            if status_log:
                                status_log += " | "
                            status_log += f"Compiled PDF to {os.path.basename(res['pdf_path'])}"
                        elif compile_pdf and not res.get('pdf_success'):
                            if status_log:
                                status_log += " | "
                            status_log += "PDF Compilation FAILED"
                            
                    if not status_log:
                        status_log = "  Processed successfully."
                        
                    yield "data: " + json.dumps({
                        'status': 'progress_detail',
                        'index': idx,
                        'total': total,
                        'page': title,
                        'pdf_success': res.get('pdf_success', False) if compile_pdf else False,
                        'log': status_log
                    }) + "\n\n"
                    
                except Exception as ex:
                    yield "data: " + json.dumps({
                        'status': 'progress_detail',
                        'index': idx,
                        'total': total,
                        'page': title,
                        'pdf_success': False,
                        'log': f"  FAILED: {str(ex)}"
                    }) + "\n\n"
                    
            yield "data: " + json.dumps({'status': 'complete', 'message': f'Successfully completed downloads for {course.upper()} - {section}.'}) + "\n\n"
        except Exception as e:
            yield "data: " + json.dumps({'status': 'error', 'message': f'Streaming error: {str(e)}'}) + "\n\n"

    return Response(event_stream(), mimetype='text/event-stream')

@app.route('/api/files')
def list_downloaded_files():
    """Lists downloaded markdown and pdf files, grouped by course and section."""
    md_dir = os.path.join(DOWNLOADS_DIR, "markdown_output")
    pdf_dir = os.path.join(DOWNLOADS_DIR, "pdfs")
    
    courses_data = {}
    
    # Traverse Markdown files
    if os.path.exists(md_dir):
        for course_code in os.listdir(md_dir):
            course_path = os.path.join(md_dir, course_code)
            if not os.path.isdir(course_path):
                continue
                
            course_name = course_code.upper()
            if course_name not in courses_data:
                courses_data[course_name] = {}
                
            for section in os.listdir(course_path):
                section_path = os.path.join(course_path, section)
                if not os.path.isdir(section_path) or section == 'images':
                    continue
                    
                if section not in courses_data[course_name]:
                    courses_data[course_name][section] = []
                    
                slugs = {}
                
                # Check markdown output folder
                if os.path.exists(section_path):
                    for file in os.listdir(section_path):
                        if file == 'images' or os.path.isdir(os.path.join(section_path, file)):
                            continue
                        name, ext = os.path.splitext(file)
                        ext = ext.lower()
                        if name not in slugs:
                            slugs[name] = {'md': None, 'pdf': None, 'attachment': None}
                        if ext == '.md':
                            slugs[name]['md'] = file
                        elif ext != '.pdf': # E.g. .zip, .docx
                            slugs[name]['attachment'] = file
                            
                # Check pdfs folder
                section_pdf_path = os.path.join(pdf_dir, course_code, section)
                if os.path.exists(section_pdf_path):
                    for file in os.listdir(section_pdf_path):
                        if os.path.isdir(os.path.join(section_pdf_path, file)):
                            continue
                        name, ext = os.path.splitext(file)
                        ext = ext.lower()
                        if name not in slugs:
                            slugs[name] = {'md': None, 'pdf': None, 'attachment': None}
                        if ext == '.pdf':
                            slugs[name]['pdf'] = file
                            
                for slug, file_info in slugs.items():
                    md_file = file_info['md']
                    pdf_file = file_info['pdf']
                    attachment_file = file_info['attachment']
                    
                    has_md = md_file is not None
                    has_pdf = pdf_file is not None
                    has_attachment = attachment_file is not None
                    
                    # Determine title
                    title = slug
                    if has_md:
                        try:
                            with open(os.path.join(section_path, md_file), 'r', encoding='utf-8') as f:
                                first_line = f.readline().strip()
                                if first_line.startswith('# '):
                                    title = first_line[2:]
                        except:
                            pass
                    else:
                        title = slug
                        
                    # Clean title on-the-fly (to normalize old cached files)
                    import re
                    sem_str = ""
                    sem_match = re.search(r'_(zs|ls)(\d{2})(\d{2})$', slug.lower())
                    if sem_match:
                        sem_type = sem_match.group(1).upper()
                        yr1 = sem_match.group(2)
                        yr2 = sem_match.group(3)
                        sem_str = f"{sem_type} {yr1}/{yr2}"
                        
                    if re.match(r'^(zs|ls)\d{4}$', title.lower()) and sem_str:
                        title = sem_str
                    elif title.isdigit() or len(title) <= 3:
                        nice_categories = {
                            'zkouska': 'Zkouška',
                            'test1': 'Test 1',
                            'test2': 'Test 2',
                            'test-a': 'Test A',
                            'testy': 'Test',
                            'ostatni': 'Ostatní',
                            'ukoly-1': 'Úkol 1',
                            'ukoly-2': 'Úkol 2',
                            'ukoly-3': 'Úkol 3',
                            'ukoly': 'Úkol',
                            'semestralky': 'Semestrální práce',
                            'cviceni': 'Cvičení',
                            'prednasky': 'Přednáška'
                        }
                        cat_name = nice_categories.get(section.lower(), section.capitalize())
                        base_title = f"{cat_name} - {title}" if not title.startswith(cat_name) else title
                        if sem_str:
                            title = f"{base_title} ({sem_str})"
                        else:
                            title = base_title
                    elif sem_str and sem_str.lower() not in title.lower():
                        title = f"{title} ({sem_str})"
                        
                    # Add attachment type if present (e.g. "ZIP", "DOCX")
                    if has_attachment and not has_md:
                        _, ext = os.path.splitext(attachment_file)
                        title = f"{title} ({ext[1:].upper()} příloha)"
                        
                    courses_data[course_name][section].append({
                        'slug': slug,
                        'title': title,
                        'has_md': has_md,
                        'has_pdf': has_pdf,
                        'has_attachment': has_attachment,
                        'md_file': f"{course_code}/{section}/{md_file}" if has_md else None,
                        'pdf_file': f"{course_code}/{section}/{pdf_file}" if has_pdf else None,
                        'attachment_file': f"{course_code}/{section}/{attachment_file}" if has_attachment else None
                    })
                        
    return jsonify({'success': True, 'data': courses_data})

@app.route('/api/archive')
def download_archive():
    import zipfile
    import io
    
    course = request.args.get('course', '').strip().lower()
    section = request.args.get('section', '').strip().lower()
    include_markdown = request.args.get('markdown', 'true').lower() == 'true'
    include_pdf = request.args.get('pdf', 'true').lower() == 'true'
    
    if not course or not section:
        return jsonify({'success': False, 'message': 'Missing course or section.'}), 400
        
    if not include_markdown and not include_pdf:
        return jsonify({'success': False, 'message': 'You must select at least one format (markdown or pdf) to download.'}), 400
        
    md_dir = os.path.join(DOWNLOADS_DIR, "markdown_output", course, section)
    pdf_dir = os.path.join(DOWNLOADS_DIR, "pdfs", course, section)
    
    if not os.path.exists(md_dir) and not os.path.exists(pdf_dir):
        return jsonify({'success': False, 'message': 'No downloaded files found for this section.'}), 404
        
    # Create ZIP in memory
    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zipf:
        written_files = set()
        
        # 1. Process files in md_dir (markdown files, images, raw attachments)
        if os.path.exists(md_dir):
            for root, dirs, files in os.walk(md_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(file_path, md_dir)
                    
                    name, ext = os.path.splitext(file)
                    ext = ext.lower()
                    
                    # Check if it's an image
                    is_image = "images" in root.split(os.sep) or ext in ['.png', '.jpg', '.jpeg', '.gif', '.svg']
                    is_page = ext in ['.md', '.html']
                    
                    if is_image:
                        if include_markdown:
                            # Keep images in their images/ relative subfolder in the ZIP root
                            archive_path = os.path.join("images", os.path.basename(file_path))
                            if archive_path not in written_files:
                                zipf.write(file_path, archive_path)
                                written_files.add(archive_path)
                    elif is_page:
                        if include_markdown:
                            archive_path = rel_path # directly in root of zip (e.g. file.md)
                            if archive_path not in written_files:
                                zipf.write(file_path, archive_path)
                                written_files.add(archive_path)
                    else:
                        # Raw attachments (like .zip, .docx) are always packed directly in the root of the ZIP
                        archive_path = rel_path
                        if archive_path not in written_files:
                            zipf.write(file_path, archive_path)
                            written_files.add(archive_path)
                            
        # 2. Process files in pdf_dir (compiled PDFs and PDF attachments)
        if include_pdf and os.path.exists(pdf_dir):
            for root, dirs, files in os.walk(pdf_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(file_path, pdf_dir)
                    
                    # PDF files go directly in the root of the ZIP
                    archive_path = rel_path
                    if archive_path not in written_files:
                        zipf.write(file_path, archive_path)
                        written_files.add(archive_path)
                    
    memory_file.seek(0)
    return Response(
        memory_file.getvalue(),
        mimetype="application/zip",
        headers={"Content-Disposition": f"attachment; filename={course.upper()}_{section}.zip"}
    )

@app.route('/api/cleanup', methods=['POST'])
def cleanup_downloads_and_cache():
    """Cleans up the downloaded files and the scraping cache."""
    import shutil
    
    deleted_paths = []
    
    # 1. Clear markdown outputs
    md_dir = os.path.join(DOWNLOADS_DIR, "markdown_output")
    if os.path.exists(md_dir):
        try:
            shutil.rmtree(md_dir)
            os.makedirs(md_dir, exist_ok=True)
            deleted_paths.append("downloads/markdown_output")
        except Exception as e:
            return jsonify({'success': False, 'message': f'Failed to clean markdown output: {str(e)}'}), 500
            
    # 2. Clear pdf outputs
    pdf_dir = os.path.join(DOWNLOADS_DIR, "pdfs")
    if os.path.exists(pdf_dir):
        try:
            shutil.rmtree(pdf_dir)
            os.makedirs(pdf_dir, exist_ok=True)
            deleted_paths.append("downloads/pdfs")
        except Exception as e:
            return jsonify({'success': False, 'message': f'Failed to clean pdfs: {str(e)}'}), 500
            
    # 3. Clear scraping cache (so pages are re-scraped)
    cache_dirs = [
        os.path.join(DOWNLOADS_DIR, "cache"),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "cache")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fitwiki", "cache"))
    ]
    for cache_dir in cache_dirs:
        if os.path.exists(cache_dir):
            try:
                shutil.rmtree(cache_dir)
                os.makedirs(cache_dir, exist_ok=True)
                deleted_paths.append("mezipaměť (" + os.path.basename(os.path.dirname(cache_dir)) + ")")
            except:
                pass
                
    return jsonify({'success': True, 'message': f'Successfully cleared: {", ".join(deleted_paths)}'})

# Serving raw files
@app.route('/downloads/markdown/<path:filename>')
def serve_markdown(filename):
    md_dir = os.path.join(DOWNLOADS_DIR, "markdown_output")
    return send_from_directory(md_dir, filename)

@app.route('/downloads/pdf/<path:filename>')
def serve_pdf(filename):
    pdf_dir = os.path.join(DOWNLOADS_DIR, "pdfs")
    # Force PDF download or inline view in browser
    return send_from_directory(pdf_dir, filename)

if __name__ == '__main__':
    host = os.getenv("FLASK_HOST", "127.0.0.1")
    port = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() == "true"
    app.run(host=host, port=port, debug=debug)
