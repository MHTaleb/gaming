# Application layer (RZ-008+)
# Encounter/run orchestration, reward and save use cases.
# Translates run requests into domain actions; calls repositories for persistence.

# Current files
# - combat_session.gd (RZ-007): single-encounter session; loads the pack via the
#   content repository, builds the actor set, and runs player intents through the
#   pure resolver. Presentation reads it; run-level orchestration is RZ-008.
