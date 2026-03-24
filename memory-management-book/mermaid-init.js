// Initialize Mermaid.js for mdBook
document.addEventListener('DOMContentLoaded', function() {
    mermaid.initialize({
        startOnLoad: true,
        theme: 'base',
        themeVariables: {
            primaryColor: '#e8f5e9',
            primaryTextColor: '#1b5e20',
            primaryBorderColor: '#4caf50',
            lineColor: '#616161',
            secondaryColor: '#f1f8e9',
            tertiaryColor: '#ffffff',
            background: '#ffffff',
            mainBkg: '#e8f5e9',
            secondBkg: '#f1f8e9',
            border1: '#4caf50',
            border2: '#81c784',
            arrowheadColor: '#4caf50'
        },
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
});
