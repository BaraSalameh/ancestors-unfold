# Temporary architecture exceptions

The architecture limits are errors by default. There are currently no approved
temporary exceptions. Adding one requires deliberate approval plus a recorded
owner phase, reason, and removal condition. Exceptions may disable only size and
complexity rules, never dependency or security boundaries.

Generated routing code, historical SQL migrations, locale dictionaries, and
external-style primitives in `src/shared/ui` are structural exclusions rather
than temporary exceptions.
