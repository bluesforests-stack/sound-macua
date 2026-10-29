from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import webbrowser, threading, argparse
parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=0)
parser.add_argument('--no-browser',action='store_true')
args=parser.parse_args()
root=Path(__file__).resolve().parent
server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(SimpleHTTPRequestHandler,directory=str(root)))
url=f'http://127.0.0.1:{server.server_port}/'
print(f'Website: {url}  (Ctrl+C to stop)',flush=True)
if not args.no_browser: threading.Timer(.5,lambda:webbrowser.open(url)).start()
try: server.serve_forever()
except KeyboardInterrupt: pass
finally: server.server_close()
