import test from 'node:test';
import assert from 'node:assert/strict';
import {actionEcho,admitFailure} from '../src/action-feedback.js';
test('passive looking stays quiet, held progress echoes briefly, and pause cancels it',()=>{
 assert.equal(actionEcho(null,{kind:'dig',active:true,now:0}),null);
 let echo=actionEcho(null,{kind:'water',active:true,progress:.4,now:1});
 assert.equal(echo.progress,.4);
 echo=actionEcho(echo,{kind:'water',active:true,progress:.7,now:21});assert.equal(echo.progress,.7);
 assert.equal(actionEcho(echo,{now:21.3}),echo);
 assert.equal(actionEcho(echo,{now:21.7}),null);
 assert.equal(actionEcho(echo,{visible:false,now:21.1}),null);
});
test('held failure cannot continually renew feedback, and a different target can recover',()=>{
 const memory={};assert.equal(admitFailure(memory,'outside','1,30',0),true);
 for(let t=.1;t<4.9;t+=.1)assert.equal(admitFailure(memory,'outside','1,30',t),false);
 assert.equal(admitFailure(memory,'support','0,0',4.9),true);
 assert.equal(admitFailure(memory,'outside','1,30',5),false);
 assert.equal(admitFailure(memory,'outside','1,30',5.5),true);
});
