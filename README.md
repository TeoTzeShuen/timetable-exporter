# SIT Timetable Exporter

A small Firefox extension that exports your class schedule from the SIT self-service portal ([in4sit](https://in4sit.singaporetech.edu.sg)) as an `.ics` calendar file or a CSV.

Each class becomes its own calendar event, titled like `ACC2022 - Investment Risk Management (Seminar)`. The room is the location, and the section and instructor go in the description.

## Install

Grab the latest `.xpi` from the [Releases](https://github.com/TeoTzeShuen/timetable-exporter/releases/latest) page and open it in Firefox (or drag it onto a Firefox window), then confirm the install.

Requires Firefox 128 or newer.

## Usage

1. Log in to in4sit and open **My Class Schedule**.
2. Make sure **List View** is selected.
3. Click **.ics** or **.csv** in the "Export timetable" box at the bottom-right of the page.
4. Import the `.ics` file into your calendar app (Google Calendar, Apple Calendar, Outlook, etc.).

Re-importing a newer export updates the existing events instead of creating duplicates, so you can re-export whenever your timetable changes.

## Privacy

Everything runs locally in your browser. The extension only reads the schedule page and builds the file on your machine. Nothing is sent anywhere.

## Notes

- Classes listed as TBA (no day/time) are skipped.
- Events are generated for every matching weekday in each class's date range, so check recess week and public holidays against the official academic calendar.
