# Sprint 4 Report (1/5/2025 - 2/5/2025)

## YouTube link of Sprint * Video (Make this video unlisted)
https://youtu.be/e5Bqy5DHFZg

## What's New (User Facing)
 * Module 4 prototype. Module 4 allows users to transform real-time data into a format that can be utilized by Modules 1-3 for data analysis.

## Work Summary (Developer Facing)
This sprint we encountered a significant roadblock in accessing the stream of data that needed to be transformed. We tried several solutions including gaining administer permissions to the lab computer, preventing other programs from using the serial port, and testing other serial ports on the computer. After finding no solutions, we reached out to Stratus Engineering, the creators of the Serial Port Monitor used in Cousin's lab as well as the proprietary software is used to view the datastream. After meeting with Stratus Engineering, we discovered that the datastream may be inaccessible via Python. However, we found an alternative solution in which we can spool data from the EZView proprietary software in realtime and access the txt file output by EZView. Using this method, we constructed a prototype that converts the data hexidecimal bytestream into several CSV files containing decimal values in appropriate timeframes.

## Unfinished Work
The Module 4 prototype still needs to be tested and approved by the client. We plan to accomplish this in our next meeting on 2/12/25 and continue tweaking the program as needed.

## Completed Issues/User Stories
Here are links to the issues that we completed in this sprint:

 * https://github.com/KylerKupp/python-desktop-app/issues/94
 * https://github.com/KylerKupp/python-desktop-app/issues/95
 * https://github.com/KylerKupp/python-desktop-app/issues/96
 * https://github.com/KylerKupp/python-desktop-app/issues/97
 * https://github.com/KylerKupp/python-desktop-app/issues/98
 * https://github.com/KylerKupp/python-desktop-app/issues/99
 * https://github.com/KylerKupp/python-desktop-app/issues/100
 * https://github.com/KylerKupp/python-desktop-app/issues/101
 * https://github.com/KylerKupp/python-desktop-app/issues/102
 * https://github.com/KylerKupp/python-desktop-app/issues/103
 * https://github.com/KylerKupp/python-desktop-app/issues/104
 * https://github.com/KylerKupp/python-desktop-app/issues/105
 * https://github.com/KylerKupp/python-desktop-app/issues/108
 
 ## Incomplete Issues/User Stories
 Here are links to issues we worked on but did not complete in this sprint:
 
 * https://github.com/KylerKupp/python-desktop-app/issues/25 Prototype was created but has not been fully tested.

## Code Files for Review
Please review the following code files, which were actively developed during this sprint, for quality:
 * [main.py](https://github.com/KylerKupp/python-desktop-app/blob/module-4-read-data/module4/application/main.py)
 
## Retrospective Summary
Here's what went well:
  * Communication among team members and client
  * Resourcefulness in troubleshooting
  * Perserverance through obstacles
 
Here's what we'd like to improve:
   * Rate of development
  
Here are changes we plan to implement in the next sprint:
   * We plan to make significant changes to the system each week and seek help immediately when encountering roadblocks.
