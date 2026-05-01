use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use tiny_http::{Header, Response, Server};
use url::Url;

const SUCCESS_HTML: &str = "<!doctype html><html><body style='font-family:sans-serif;padding:2rem;text-align:center;background:#020617;color:#e2e8f0'><h2 style='color:#06b6d4'>Connected ✓</h2><p>You can close this tab and return to Trak Automations.</p></body></html>";

const ERROR_HTML: &str = "<!doctype html><html><body style='font-family:sans-serif;padding:2rem;text-align:center;background:#020617;color:#e2e8f0'><h2 style='color:#f87171'>OAuth failed</h2><p>Return to Trak Automations and check the error message.</p></body></html>";

pub struct LoopbackServer {
    pub port: u16,
    receiver: mpsc::Receiver<CallbackResult>,
    _join: thread::JoinHandle<()>,
}

#[derive(Debug)]
pub struct CallbackResult {
    pub code: String,
    pub state: String,
}

impl LoopbackServer {
    pub fn start(expected_state: String) -> std::io::Result<Self> {
        let server = Server::http("127.0.0.1:0").map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, format!("server start: {e}"))
        })?;
        let port = server
            .server_addr()
            .to_ip()
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "no ip addr"))?
            .port();
        let (tx, rx) = mpsc::channel();

        let join = thread::spawn(move || {
            let html_header: Header = "Content-Type: text/html; charset=utf-8".parse().unwrap();
            for request in server.incoming_requests() {
                let url_str = format!("http://127.0.0.1{}", request.url());
                let parsed = Url::parse(&url_str);

                let extracted = match parsed {
                    Ok(u) => {
                        let mut code = None;
                        let mut state = None;
                        for (k, v) in u.query_pairs() {
                            if k == "code" {
                                code = Some(v.into_owned());
                            } else if k == "state" {
                                state = Some(v.into_owned());
                            }
                        }
                        (code, state)
                    }
                    Err(_) => (None, None),
                };

                match extracted {
                    (Some(code), Some(state)) if state == expected_state => {
                        let _ = request.respond(
                            Response::from_string(SUCCESS_HTML).with_header(html_header.clone()),
                        );
                        let _ = tx.send(CallbackResult { code, state });
                        break;
                    }
                    _ => {
                        let _ = request.respond(
                            Response::from_string(ERROR_HTML).with_header(html_header.clone()),
                        );
                    }
                }
            }
        });

        Ok(LoopbackServer {
            port,
            receiver: rx,
            _join: join,
        })
    }

    pub fn wait_for_callback(self, timeout: Duration) -> Option<CallbackResult> {
        self.receiver.recv_timeout(timeout).ok()
    }
}
