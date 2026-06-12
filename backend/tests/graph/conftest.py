"""Graph-level conftest.

This file exists so that graph integration tests can be run in isolation
from the root tests/conftest.py, which has a pre-existing SQLAlchemy import
issue with double table registration.

Run with::

    pytest tests/graph/ --confcutdir=tests/graph -v

The ``--confcutdir`` prevents pytest from loading the parent conftest.
"""
