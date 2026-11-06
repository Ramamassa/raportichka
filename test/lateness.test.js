import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {initialState,setAttendance,setAbsence,dayHours,monthRows,validateState,copyLesson,clearLesson,reconcileStudents} from '../model.js';
import {createAttendanceWorkbook} from '../excel.js';
import {setupAttendanceGesture} from '../attendance-gesture.js';

test('late replaces absence, old backups survive, copy/clear and roster changes preserve correct hours',()=>{
 const s=initialState(), id=s.students[0].id, date='2026-11-06';
 assert.deepEqual(validateState(s),s);
 setAbsence(s,date,1,id,true); assert.equal(dayHours(s,date,id),2);
 setAttendance(s,date,1,id,'late'); assert.equal(dayHours(s,date,id),1);
 assert.deepEqual(s.marks[date][1],[]);
 copyLesson(s,date,2); assert.equal(dayHours(s,date,id),2);
 setAbsence(s,date,3,id,true); assert.equal(monthRows(s,'2026-11')[0].total,4);
 assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);
 clearLesson(s,date,2); assert.equal(dayHours(s,date,id),3);
 const bad=structuredClone(s);bad.marks[date][1]=[id];assert.throws(()=>validateState(bad));
 bad.marks[date][1]=[];bad.late[date][1]=['unknown'];assert.throws(()=>validateState(bad));
 reconcileStudents(s,s.students.filter(p=>p.id!==id));assert.equal(dayHours(s,date,id),0);
 assert.doesNotThrow(()=>validateState(s));
});

test('downloaded XLSX includes one hour late plus two hours absent, justified stays empty',async()=>{
 const s=initialState(), id=s.students[0].id;
 setAttendance(s,'2026-11-06',1,id,'late');setAbsence(s,'2026-11-06',2,id,true);
 const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await createAttendanceWorkbook(ExcelJS,s,'2026-11').xlsx.writeBuffer());
 const sheet=loaded.getWorksheet('Ведомость');
 assert.equal(sheet.getCell('H3').value,3);assert.equal(sheet.getCell('AH3').value,3);
 assert.equal(sheet.getCell('AI3').value,null);assert.equal(sheet.getCell('AJ3').value,3);
});

test('hold marks late once, suppresses click; scroll, cancellation and short tap do not mark late',()=>{
 const events={},timers=new Map(),calls=[];let serial=0;
 const root={addEventListener:(name,fn)=>events[name]=fn};
 setupAttendanceGesture(root,id=>calls.push(id),{schedule:fn=>{timers.set(++serial,fn);return serial;},cancel:id=>timers.delete(id)});
 const label={htmlFor:'mark-student-1'},target={closest:()=>label};
 const pointer={target,isPrimary:true,button:0,pointerId:1,clientX:20,clientY:30};
 events.pointerdown(pointer);events.pointerup(pointer);assert.equal(timers.size,0);
 events.pointerdown(pointer);events.pointermove({...pointer,clientY:60});assert.equal(timers.size,0);
 events.pointerdown(pointer);events.pointercancel(pointer);assert.equal(timers.size,0);
 events.pointerdown(pointer);[...timers.values()].at(-1)();events.pointerup(pointer);
 assert.deepEqual(calls,['mark-student-1']);
 let prevented=false;events.click({target,preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,true);
 prevented=false;events.click({target,preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,false);
});
