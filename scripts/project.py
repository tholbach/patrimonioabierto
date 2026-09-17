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
