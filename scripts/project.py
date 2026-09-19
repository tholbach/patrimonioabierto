"""Shared project identity for the scripts that talk to external APIs.

One place for what they send about themselves, rather than a copy in every
script: nine copies drift, and when the contact details change there should
be exactly one line to edit.
"""

# Wikimedia's User-Agent policy asks scripts to say who to contact, so that
# a misbehaving one can be reached instead of simply having its IP blocked.
# It accepts "an email address, a website, or a wiki user", and the site is
# the better answer of the three here: it identifies the project rather than
# a person, carries its own contact details on the Aviso legal page, and
# stays correct no matter who maintains this next.
PROJECT_URL = "https://patrimonioabierto.es"


def user_agent(tool, version="1.0"):
    """User-Agent header value for one tool, e.g. "patrimonioabierto-seo".

    Each script passes its own name so the traffic stays attributable to a
    specific job. That is the point of the header: an operator on the other
    end can tell which of these is hammering them, not just that something
    from this project is.
    """
    return f"{tool}/{version} ({PROJECT_URL})"


def urlopen_with_retry(req, timeout=60, attempts=5):
    """urlopen that survives the rate limiting these APIs actually apply.

    WDQS answers a heavy query with 429 when it is busy, and a single
    unretried request turns that into a failed build: `make fetch` dies
    after the JCyL half already succeeded, and the nightly timer does the
    same at 05:00 with nobody watching. The query is not wrong when this
    happens and the service is not down - it is asking us to wait.

    Honours Retry-After when the server sends one (it knows better than a
    guess), otherwise backs off exponentially from 5s. Retries 429 and 5xx
    only: a 400 means the query itself is broken and no amount of waiting
    fixes it.
    """
    import time
    import urllib.error
    import urllib.request

    for attempt in range(1, attempts + 1):
        try:
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500:
                raise
            if attempt == attempts:
                raise
            wait = e.headers.get("Retry-After")
            wait = int(wait) if (wait or "").isdigit() else 5 * 2 ** (attempt - 1)
            print(f"  HTTP {e.code} from {req.full_url.split('?')[0]} - waiting {wait}s "
                  f"(attempt {attempt}/{attempts})", flush=True)
            time.sleep(wait)
