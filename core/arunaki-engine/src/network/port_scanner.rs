//! Parallel loopback TCP probe.

use std::net::{Ipv4Addr, SocketAddr};
use std::time::Duration;
use tokio::net::TcpStream;

/// Returns the subset of `ports` accepting TCP connections on 127.0.0.1, preserving the
/// caller's priority order. All ports are probed concurrently.
pub async fn open_loopback_ports(ports: &[u16], timeout: Duration) -> Vec<u16> {
    let handles: Vec<_> = ports
        .iter()
        .copied()
        .map(|port| {
            tokio::spawn(async move {
                let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
                let ok = matches!(
                    tokio::time::timeout(timeout, TcpStream::connect(addr)).await,
                    Ok(Ok(_))
                );
                (port, ok)
            })
        })
        .collect();

    let mut open = Vec::new();
    for h in handles {
        if let Ok((port, true)) = h.await {
            open.push(port);
        }
    }
    open
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn detects_listening_port_and_skips_closed_one() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let open_port = listener.local_addr().unwrap().port();
        // Bind-and-drop yields a port that is almost certainly closed afterwards.
        let closed_port = {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            l.local_addr().unwrap().port()
        };

        let found = open_loopback_ports(&[closed_port, open_port], Duration::from_millis(300)).await;
        assert_eq!(found, vec![open_port]);
    }

    #[tokio::test]
    async fn empty_input_returns_empty() {
        assert!(open_loopback_ports(&[], Duration::from_millis(50)).await.is_empty());
    }
}

