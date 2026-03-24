document.addEventListener('DOMContentLoaded', function() {
    mermaid.initialize({
        startOnLoad: true,
        theme: 'default',
        securityLevel: 'loose',
        flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: 'basis'
        },
        sequence: {
            actorMargin: 50,
            boxMargin: 10,
            boxTextMargin: 5,
            noteMargin: 10,
            messageMargin: 35
        }
    });
    
    // Re-render mermaid diagrams after page load
    window.addEventListener('load', function() {
        mermaid.init(undefined, document.querySelectorAll('.mermaid'));
    });
});