import { useEffect, useState } from "react"
import "./BackendStatus.css"

export default function BackendStatus() {
    const [status, setStatus] = useState("checking")

    useEffect(() => {
        const controller = new AbortController()

        async function checkBackendHealth() {
            try {
                const response = await fetch("/health", {
                    signal: controller.signal,
                })

                if (!response.ok) {
                    throw new Error(`Health check failed with status ${response.status}`)
                }

                const body = await response.json()

                if (body.status !== "ok") {
                    throw new Error("Backend returned an unexpected health response")
                }

                setStatus("online")
            } catch (error) {
                if (error.name !== "AbortError") {
                    setStatus("offline")
                }
            }
        }

        checkBackendHealth()

        return () => {
            controller.abort()
        }
    }, [])

    const statusLabel = {
        checking: "Checking backend...",
        online: "Backend online",
        offline: "Backend offline",
    }[status]

    return (
        <div
            className={`backend-status backend-status--${status}`}
            role="status"
            aria-live="polite"
        >
            <span className="backend-status-dot" aria-hidden="true" />
            <span>{statusLabel}</span>
        </div>
    )
}
