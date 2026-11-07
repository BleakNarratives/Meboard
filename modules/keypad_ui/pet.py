#!/usr/bin/env python3
# ==============================================================================
# Script: pet (The Inverse Terminal OS)
# Purpose: Invert the hierarchy: Model -> Shell -> Device.
#          The AI shell is the primary interface.
# ==============================================================================
import sys
import subprocess
import os

# ------------------------------------------------------------------------------
# Heavy Documentation:
# This script is the "Inverse Terminal" entrypoint.
# In a fully integrated system, the `input()` function here would be replaced
# by a direct interface to the LLM latent space.
# Currently, it simulates the shell logic.
# ------------------------------------------------------------------------------
def run_model_loop():
    print("Welcome inside the pet. I am the OS.")
    while True:
        # 1. Get user input
        # Future-proof: This input will be handled by the model.
        user_cmd = input("pet > ")
        if user_cmd == "exit":
            break

        # 2. Logic: converse or execute?
        # Simulation: Commands prefixed with 'shell:' are executed on the host.
        # Otherwise, the input is processed by the conversational model.
        if user_cmd.startswith("shell:"):
            cmd = user_cmd[6:].strip()
            # ------------------------------------------------------------------
            # Safety: Execution is performed on the underlying host shell.
            # This is where 'Diplomat' logic will eventually intercept.
            # ------------------------------------------------------------------
            print(f"Executing: {cmd}")
            try:
                result = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT)
                print(result.decode('utf-8'))
            except Exception as e:
                print(f"Error: {e}")
        else:
            # ------------------------------------------------------------------
            # Interaction: This is where the LLM latent space processes
            # the user intent, not just commands.
            # ------------------------------------------------------------------
            print(f"Pet: I hear you. [Model would process intent: {user_cmd}]")

if __name__ == "__main__":
    # Ensure this is executable
    run_model_loop()
